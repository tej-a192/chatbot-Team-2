# server/rag_service/app.py

import os
import sys
import traceback
from flask import Flask, request, jsonify, current_app, send_from_directory, after_this_request
import logging
import atexit
import uuid

from duckduckgo_search import DDGS

# --- Add server directory to sys.path ---
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import config
config.setup_logging() # Initialize logging as per your config

# --- Import configurations and services ---
try:
    from vector_db_service import VectorDBService
    import ai_core
    import neo4j_handler 
    from neo4j import exceptions as neo4j_exceptions
    import document_generator
    import podcast_generator # <<< NEW IMPORT
    import google.generativeai as genai

    if config.GEMINI_API_KEY:
        genai.configure(api_key=config.GEMINI_API_KEY)
        # Configure with safety settings to prevent common blockages
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
        LLM_MODEL = genai.GenerativeModel(config.GEMINI_MODEL_NAME, safety_settings=safety_settings)
    else:
        LLM_MODEL = None
        logging.getLogger(__name__).error("GEMINI_API_KEY not found, AI features will fail.")

    def llm_wrapper(prompt):
        """A simple wrapper to call the configured Gemini model."""
        if not LLM_MODEL:
            raise ConnectionError("Gemini API Key is not configured in the Python service.")
        
        # Added a retry mechanism for transient API errors
        for attempt in range(3):
            try:
                response = LLM_MODEL.generate_content(prompt)
                # Check for content before accessing text
                if response.parts:
                    return "".join(part.text for part in response.parts if hasattr(part, 'text'))
                # Handle cases where prompt is blocked
                elif response.prompt_feedback and response.prompt_feedback.block_reason:
                     raise ValueError(f"Prompt blocked by API. Reason: {response.prompt_feedback.block_reason_message}")
                else:
                    # Handle empty response without explicit block
                    logger.warning("LLM returned empty response without explicit block reason.")
                    return "" # Return empty string to signal no content
            except Exception as e:
                logger.warning(f"LLM generation attempt {attempt + 1} failed: {e}")
                if attempt == 2: # Last attempt
                    raise
        return "" # Should not be reached if exception is raised on last attempt

except ImportError as e:
    print(f"CRITICAL IMPORT ERROR: {e}.")
    sys.exit(1)

logger = logging.getLogger(__name__)
app = Flask(__name__)

GENERATED_DOCS_DIR = os.path.join(SERVER_DIR, 'generated_docs')
os.makedirs(GENERATED_DOCS_DIR, exist_ok=True)
app.config['GENERATED_DOCS_DIR'] = GENERATED_DOCS_DIR

# Initialize services
vector_service = None
try:
    vector_service = VectorDBService()
    vector_service.setup_collection()
    app.vector_service = vector_service
except Exception as e:
    logger.critical(f"Failed to initialize VectorDBService: {e}", exc_info=True)

try:
    neo4j_handler.init_driver()
except Exception as e:
    logger.critical(f"Neo4j driver failed to initialize: {e}.")

atexit.register(neo4j_handler.close_driver)

# Helper function for error responses
def create_error_response(message, status_code=500, details=None):
    log_message = f"API Error ({status_code}): {message}"
    if details:
        log_message += f" | Details: {details}"
    current_app.logger.error(log_message)
    response_payload = {"error": message}
    if details and status_code != 500:
        response_payload["details"] = details
    return jsonify(response_payload), status_code

# === API Endpoints ===

@app.route('/export_podcast', methods=['POST'])
def export_podcast_route():
    current_app.logger.info("--- /export_podcast Request (Two-Speaker) ---")
    data = request.get_json()
    if not data:
        return create_error_response("Request must be JSON", 400)

    source_document_text = data.get('sourceDocumentText')
    outline_content = data.get('outlineContent')
    # podcast_options is now handled within the new prompt, so we don't need it here.
    
    if not all([source_document_text, outline_content]):
        return create_error_response("Missing 'sourceDocumentText' or 'outlineContent'", 400)

    try:
        # Step 1: Generate the two-speaker script
        script = podcast_generator.generate_podcast_script(
            source_document_text,
            outline_content,
            llm_wrapper # Use the existing llm_wrapper for Gemini
        )
        
        # Step 2: Parse the script into dialogue parts
        dialogue = podcast_generator.parse_script_into_dialogue(script)
        if not dialogue:
            raise ValueError("Failed to parse the generated script into speaker parts.")

        # Step 3: Synthesize the dual-speaker audio
        unique_id = str(uuid.uuid4())
        filename = f"podcast_session_{unique_id}.mp3"
        output_path = os.path.join(app.config['GENERATED_DOCS_DIR'], filename)
        
        podcast_generator.synthesize_dual_speaker_audio(dialogue, output_path)
        
        # Step 4: Stream the file back and schedule for cleanup
        @after_this_request
        def cleanup(response):
            try:
                os.remove(output_path)
                logger.info(f"Cleaned up temporary podcast file: {output_path}")
            except OSError as e:
                logger.error(f"Error deleting temporary podcast file {output_path}: {e}")
            return response

        logger.info(f"Successfully generated dual-speaker podcast: {filename}.")
        return send_from_directory(
            app.config['GENERATED_DOCS_DIR'],
            filename,
            as_attachment=True
        )

    except Exception as e:
        logger.error(f"Failed to generate podcast: {e}", exc_info=True)
        return create_error_response(f"Failed to generate podcast: {str(e)}", 500)


@app.route('/generate_document', methods=['POST'])
def generate_document_route():
    current_app.logger.info("--- /generate_document Request ---")
    data = request.get_json()
    if not data:
        return create_error_response("Request must be JSON", 400)
    
    outline_content = data.get('markdownContent')
    doc_type = data.get('docType')
    source_document_text = data.get('sourceDocumentText')

    if not all([outline_content, doc_type, source_document_text]):
        return create_error_response("Missing 'markdownContent', 'docType', or 'sourceDocumentText'", 400)

    try:
        expanded_content = document_generator.expand_content_with_llm(
            outline_content, 
            source_document_text, 
            doc_type,
            llm_wrapper
        )
        
        if doc_type == 'pptx':
            slides_data = document_generator.parse_pptx_json(expanded_content)
        else: # docx
            slides_data = document_generator.refined_parse_docx_markdown(expanded_content)

        unique_id = str(uuid.uuid4())
        filename = f"generated_doc_{unique_id}.{doc_type}"
        output_path = os.path.join(app.config['GENERATED_DOCS_DIR'], filename)

        if doc_type == 'pptx':
            document_generator.create_ppt(slides_data, output_path)
        elif doc_type == 'docx':
            document_generator.create_doc(slides_data, output_path, "text_content")
        
        logger.info(f"Successfully generated expanded document: {filename}")
        # The response is now handled by the download route, but we keep this for consistency
        return jsonify({"success": True, "filename": filename}), 201

    except Exception as e:
        logger.error(f"Failed to generate document: {e}", exc_info=True)
        return create_error_response(f"Failed to generate document: {str(e)}", 500)

@app.route('/download_document/<filename>', methods=['GET'])
def download_document_route(filename):
    current_app.logger.info(f"--- /download_document/{filename} Request ---")
    if '..' in filename or filename.startswith('/'):
        return create_error_response("Invalid filename.", 400)
    try:
        file_path = os.path.join(app.config['GENERATED_DOCS_DIR'], filename)
        if not os.path.exists(file_path):
             return create_error_response("File not found.", 404)
        @after_this_request
        def cleanup(response):
            try:
                os.remove(file_path)
                logger.info(f"Cleaned up temporary file: {file_path}")
            except OSError as e:
                logger.error(f"Error deleting temporary file {file_path}: {e}")
            return response
        return send_from_directory(
            app.config['GENERATED_DOCS_DIR'],
            filename,
            as_attachment=True
        )
    except Exception as e:
        logger.error(f"Error during document download for {filename}: {e}", exc_info=True)
        return create_error_response("Could not process download request.", 500)


@app.route('/web_search', methods=['POST'])
def web_search_route():
    data = request.get_json()
    if not data or 'query' not in data: return create_error_response("Missing 'query' in request body", 400)
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(data['query'], max_results=5))
        return jsonify([{"title": r.get("title"), "url": r.get("href"), "content": r.get("body")} for r in results]), 200
    except Exception as e: return create_error_response(f"Web search failed: {str(e)}", 500)

@app.route('/health', methods=['GET'])
def health_check():
    status_details = { "status": "error", "qdrant_service": "not_initialized", "qdrant_collection_name": config.QDRANT_COLLECTION_NAME, "qdrant_collection_status": "unknown", "document_embedding_model": config.DOCUMENT_EMBEDDING_MODEL_NAME, "query_embedding_model": config.QUERY_EMBEDDING_MODEL_NAME, "neo4j_service": "not_initialized_via_handler", "neo4j_connection": "unknown" }
    http_status_code = 503
    if not vector_service:
        status_details["qdrant_service"] = "failed_to_initialize"
    else:
        status_details["qdrant_service"] = "initialized"
        try:
            vector_service.client.get_collection(collection_name=vector_service.collection_name)
            status_details["qdrant_collection_status"] = "exists_and_accessible"
        except Exception as e:
            status_details["qdrant_collection_status"] = f"error_accessing_collection: {str(e)}"
    neo4j_ok, neo4j_conn_status = neo4j_handler.check_neo4j_connectivity()
    if neo4j_ok:
        status_details["neo4j_service"], status_details["neo4j_connection"] = "initialized_via_handler", "connected"
    else:
        status_details["neo4j_service"], status_details["neo4j_connection"] = "initialization_failed_or_handler_error", neo4j_conn_status
    if status_details["qdrant_service"] == "initialized" and status_details["qdrant_collection_status"] == "exists_and_accessible" and neo4j_ok:
        status_details["status"], http_status_code = "ok", 200
    return jsonify(status_details), http_status_code

@app.route('/add_document', methods=['POST'])
def add_document_qdrant():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, file_path, original_name = data.get('user_id'), data.get('file_path'), data.get('original_name')
    if not all([user_id, file_path, original_name]):
        return create_error_response("Missing required fields: user_id, file_path, original_name", 400)
    if not os.path.exists(file_path):
        return create_error_response(f"File not found at server path: {file_path}", 404)
    try:
        processed_chunks, raw_text, kg_chunks = ai_core.process_document_for_qdrant(file_path, original_name, user_id)
        num_chunks_added, status = 0, "processed_no_content"
        if processed_chunks:
            num_chunks_added = app.vector_service.add_processed_chunks(processed_chunks)
            if num_chunks_added > 0: status = "added_to_qdrant"
        return jsonify({ "message": "Document processed.", "status": status, "filename": original_name, "num_chunks_added_to_qdrant": num_chunks_added, "raw_text_for_analysis": raw_text or "", "chunks_with_metadata": kg_chunks }), 201
    except Exception as e:
        logger.error(f"Error in /add_document for '{original_name}': {e}", exc_info=True)
        return create_error_response(f"Failed to process document: {str(e)}", 500)

@app.route('/query', methods=['POST'])
def search_qdrant_documents_and_get_kg():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    query_text, user_id = data.get('query'), data.get('user_id')
    if not query_text or not user_id:
        return create_error_response("Missing 'query' or 'user_id'", 400)
    try:
        from qdrant_client import models as qdrant_models
        k, documentContextName, use_kg = data.get('k', 5), data.get('documentContextName'), data.get('use_kg_critical_thinking', False)
        must_conditions = []
        if documentContextName:
            must_conditions.append(qdrant_models.FieldCondition(key="file_name", match=qdrant_models.MatchValue(value=documentContextName)))
        qdrant_filters = qdrant_models.Filter(must=must_conditions) if must_conditions else None
        retrieved_docs, snippet, docs_map = vector_service.search_documents(query=query_text, k=k, filter_conditions=qdrant_filters)
        return jsonify({ "retrieved_documents_list": [doc.to_dict() for doc in retrieved_docs], "formatted_context_snippet": snippet, "retrieved_documents_map": docs_map, "knowledge_graphs": {} }), 200
    except Exception as e:
        logger.error(f"Error in /query: {e}", exc_info=True)
        return create_error_response(f"Query failed: {str(e)}", 500)

@app.route('/delete_qdrant_document_data', methods=['DELETE'])
def delete_qdrant_data_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, document_name = data.get('user_id'), data.get('document_name') 
    if not user_id or not document_name:
        return create_error_response("Missing 'user_id' or 'document_name'", 400)
    try:
        result = vector_service.delete_document_vectors(user_id, document_name)
        return jsonify(result), 200
    except Exception as e:
        return create_error_response(f"Deletion failed: {str(e)}", 500)

# KG Endpoints
@app.route('/kg', methods=['POST'])
def add_or_update_kg_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, original_name, nodes, edges = data.get('userId'), data.get('originalName'), data.get('nodes'), data.get('edges')
    if not all([user_id, original_name, isinstance(nodes, list), isinstance(edges, list)]):
        return create_error_response("Missing or invalid fields", 400)
    try:
        result = neo4j_handler.ingest_knowledge_graph(user_id, original_name, nodes, edges)
        return jsonify({"message": "KG ingested", "status": "completed", **result}), 201
    except Exception as e:
        return create_error_response(f"KG ingestion failed: {str(e)}", 500)

@app.route('/kg/<user_id>/<path:document_name>', methods=['GET'])
def get_kg_route(user_id, document_name):
    try:
        kg_data = neo4j_handler.get_knowledge_graph(user_id, document_name)
        return jsonify(kg_data) if kg_data else create_error_response("KG not found", 404)
    except Exception as e:
        return create_error_response(f"KG retrieval failed: {str(e)}", 500)

@app.route('/kg/<user_id>/<path:document_name>', methods=['DELETE'])
def delete_kg_route(user_id, document_name):
    try:
        deleted = neo4j_handler.delete_knowledge_graph(user_id, document_name)
        return jsonify({"message": "KG deleted"}) if deleted else create_error_response("KG not found", 404)
    except Exception as e:
        return create_error_response(f"KG deletion failed: {str(e)}", 500)

if __name__ == '__main__':
    logger.info(f"--- Starting RAG API Service on port {config.API_PORT} ---")
    app.run(host='0.0.0.0', port=config.API_PORT, debug=True)