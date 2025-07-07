# server/rag_service/app.py
<<<<<<< HEAD

import os
import sys
import traceback
from flask import Flask, request, jsonify, current_app, send_from_directory, after_this_request
import logging
import atexit
import uuid

from duckduckgo_search import DDGS
=======
import os
import sys
import traceback
import logging
import atexit
import uuid
import io

from flask import Flask, request, jsonify, current_app, send_from_directory, after_this_request
from pydub import AudioSegment
from duckduckgo_search import DDGS
from qdrant_client import models as qdrant_models
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238

# --- Add server directory to sys.path ---
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import config
<<<<<<< HEAD
config.setup_logging() # Initialize logging as per your config
=======
config.setup_logging()
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238

# --- Import configurations and services ---
try:
    from vector_db_service import VectorDBService
    import ai_core
    import neo4j_handler 
    from neo4j import exceptions as neo4j_exceptions
    import document_generator
<<<<<<< HEAD
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

=======
    import podcast_generator
    import academic_search
    import knowledge_graph_generator
    import google.generativeai as genai
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238
except ImportError as e:
    print(f"CRITICAL IMPORT ERROR: {e}.")
    sys.exit(1)

logger = logging.getLogger(__name__)
app = Flask(__name__)

GENERATED_DOCS_DIR = os.path.join(SERVER_DIR, 'generated_docs')
os.makedirs(GENERATED_DOCS_DIR, exist_ok=True)
app.config['GENERATED_DOCS_DIR'] = GENERATED_DOCS_DIR

<<<<<<< HEAD
# Initialize services
=======
# --- Dynamic LLM Initialization & Wrapper ---
def get_llm_model(api_key: str):
    """Dynamically creates a GenerativeModel instance with the provided API key."""
    if not api_key:
        raise ValueError("An API key is required to initialize the LLM for this request.")
    
    genai.configure(api_key=api_key)
    safety_settings = [
        {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
        {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
    ]
    return genai.GenerativeModel(config.GEMINI_MODEL_NAME, safety_settings=safety_settings)

def llm_wrapper(prompt: str, api_key: str):
    """Wrapper that takes an api_key to initialize the model for each call."""
    if not api_key:
        raise ConnectionError("Gemini API Key was not provided for this operation.")
    
    llm_model = get_llm_model(api_key)
    
    for attempt in range(3):
        try:
            response = llm_model.generate_content(prompt)
            if response.parts:
                return "".join(part.text for part in response.parts if hasattr(part, 'text'))
            elif response.prompt_feedback and response.prompt_feedback.block_reason:
                 raise ValueError(f"Prompt blocked by API. Reason: {response.prompt_feedback.block_reason_message}")
            else:
                logger.warning("LLM returned empty response without explicit block reason.")
                return ""
        except Exception as e:
            logger.warning(f"LLM generation attempt {attempt + 1} failed: {e}")
            if attempt == 2: raise
    return ""

# --- Initialize other services ---
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238
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

<<<<<<< HEAD
# Helper function for error responses
def create_error_response(message, status_code=500, details=None):
    log_message = f"API Error ({status_code}): {message}"
    if details:
        log_message += f" | Details: {details}"
    current_app.logger.error(log_message)
    response_payload = {"error": message}
    if details and status_code != 500:
        response_payload["details"] = details
=======
def create_error_response(message, status_code=500, details=None):
    log_message = f"API Error ({status_code}): {message}"
    if details: log_message += f" | Details: {details}"
    current_app.logger.error(log_message)
    response_payload = {"error": message}
    if details and status_code != 500: response_payload["details"] = details
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238
    return jsonify(response_payload), status_code

# === API Endpoints ===

<<<<<<< HEAD
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
=======
@app.route('/health', methods=['GET'])
def health_check():
    status_details = { "status": "error", "qdrant_service": "not_initialized", "neo4j_service": "not_initialized_via_handler", "neo4j_connection": "unknown"}
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238
    http_status_code = 503
    if not vector_service:
        status_details["qdrant_service"] = "failed_to_initialize"
    else:
        status_details["qdrant_service"] = "initialized"
        try:
            vector_service.client.get_collection(collection_name=vector_service.collection_name)
            status_details["qdrant_collection_status"] = "exists_and_accessible"
        except Exception as e:
<<<<<<< HEAD
            status_details["qdrant_collection_status"] = f"error_accessing_collection: {str(e)}"
=======
            status_details["qdrant_collection_status"] = f"error: {str(e)}"
    
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238
    neo4j_ok, neo4j_conn_status = neo4j_handler.check_neo4j_connectivity()
    if neo4j_ok:
        status_details["neo4j_service"], status_details["neo4j_connection"] = "initialized_via_handler", "connected"
    else:
        status_details["neo4j_service"], status_details["neo4j_connection"] = "initialization_failed_or_handler_error", neo4j_conn_status
<<<<<<< HEAD
    if status_details["qdrant_service"] == "initialized" and status_details["qdrant_collection_status"] == "exists_and_accessible" and neo4j_ok:
        status_details["status"], http_status_code = "ok", 200
=======
    
    if status_details["qdrant_service"] == "initialized" and status_details.get("qdrant_collection_status") == "exists_and_accessible" and neo4j_ok:
        status_details["status"], http_status_code = "ok", 200
    
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238
    return jsonify(status_details), http_status_code

@app.route('/add_document', methods=['POST'])
def add_document_qdrant():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, file_path, original_name = data.get('user_id'), data.get('file_path'), data.get('original_name')
<<<<<<< HEAD
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

=======
    if not all([user_id, file_path, original_name]): return create_error_response("Missing required fields", 400)
    if not os.path.exists(file_path): return create_error_response(f"File not found: {file_path}", 404)
    try:
        processed_chunks, raw_text, kg_chunks = ai_core.process_document_for_qdrant(file_path, original_name, user_id)
        num_added, status = 0, "processed_no_content"
        if processed_chunks:
            num_added = app.vector_service.add_processed_chunks(processed_chunks)
            if num_added > 0: status = "added_to_qdrant"
        return jsonify({ "message": "Document processed.", "status": status, "filename": original_name, "num_chunks_added_to_qdrant": num_added, "raw_text_for_analysis": raw_text or "", "chunks_with_metadata": kg_chunks }), 201
    except Exception as e: return create_error_response(f"Failed to process document: {str(e)}", 500)

@app.route('/query', methods=['POST'])
def search_qdrant_documents():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    query_text, user_id, k, doc_name = data.get('query'), data.get('user_id'), data.get('k', 5), data.get('documentContextName')
    if not query_text or not user_id: return create_error_response("Missing 'query' or 'user_id'", 400)
    try:
        must_conditions = [qdrant_models.FieldCondition(key="file_name", match=qdrant_models.MatchValue(value=doc_name))] if doc_name else []
        qdrant_filters = qdrant_models.Filter(must=must_conditions) if must_conditions else None
        retrieved, snippet, docs_map = vector_service.search_documents(query=query_text, k=k, filter_conditions=qdrant_filters)
        return jsonify({"retrieved_documents_list": [d.to_dict() for d in retrieved], "formatted_context_snippet": snippet, "retrieved_documents_map": docs_map}), 200
    except Exception as e: return create_error_response(f"Query failed: {str(e)}", 500)

@app.route('/academic_search', methods=['POST'])
def academic_search_route():
    data = request.get_json()
    if not data or 'query' not in data: return create_error_response("Missing 'query'", 400)
    try:
        results = academic_search.search_all_apis(data['query'], max_results_per_api=data.get('max_results', 3))
        return jsonify({"success": True, "results": results}), 200
    except Exception as e:
        return create_error_response(f"Academic search failed: {str(e)}", 500)

@app.route('/web_search', methods=['POST'])
def web_search_route():
    data = request.get_json()
    if not data or 'query' not in data: return create_error_response("Missing 'query'", 400)
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(data['query'], max_results=5))
        return jsonify([{"title": r.get("title"), "url": r.get("href"), "content": r.get("body")} for r in results]), 200
    except Exception as e: return create_error_response(f"Web search failed: {str(e)}", 500)

@app.route('/export_podcast', methods=['POST'])
def export_podcast_route():
    current_app.logger.info("--- /export_podcast Request (gTTS + Speed-Up) ---")
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    source_document_text = data.get('sourceDocumentText')
    analysis_content = data.get('analysisContent')
    podcast_options = data.get('podcastOptions', {})
    api_key = data.get('api_key')
    
    if not all([source_document_text, analysis_content, api_key]):
        return create_error_response("Missing 'sourceDocumentText', 'analysisContent', or 'api_key'", 400)

    try:
        script = podcast_generator.generate_podcast_script(
            source_document_text, 
            analysis_content,
            podcast_options,
            lambda p: llm_wrapper(p, api_key)
        )
        
        temp_gtts_filename = f"podcast_gtts_{uuid.uuid4()}.mp3"
        temp_gtts_path = os.path.join(app.config['GENERATED_DOCS_DIR'], temp_gtts_filename)
        podcast_generator.synthesize_audio_with_gtts(script, temp_gtts_path)

        sound = AudioSegment.from_mp3(temp_gtts_path)
        sped_up_sound = sound.speedup(playback_speed=1.20)
        
        final_mp3_filename = f"podcast_final_{uuid.uuid4()}.mp3"
        final_mp3_path = os.path.join(app.config['GENERATED_DOCS_DIR'], final_mp3_filename)
        
        sped_up_sound.export(final_mp3_path, format="mp3")
        os.remove(temp_gtts_path)

        @after_this_request
        def cleanup(response):
            try: os.remove(final_mp3_path)
            except OSError as e: logger.error(f"Error deleting temp podcast MP3 file {final_mp3_path}: {e}")
            return response
            
        return send_from_directory(app.config['GENERATED_DOCS_DIR'], final_mp3_filename, as_attachment=True)
    except Exception as e:
        logger.error(f"Failed to generate podcast: {e}", exc_info=True)
        return create_error_response(f"Failed to generate podcast: {str(e)}", 500)

@app.route('/generate_kg_from_text', methods=['POST'])
def generate_kg_from_text_route():
    current_app.logger.info("--- /generate_kg_from_text Request ---")
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    document_text = data.get('document_text')
    api_key = data.get('api_key')
    
    if not document_text or not api_key:
        return create_error_response("Missing 'document_text' or 'api_key' in request body", 400)
    
    try:
        graph_data = knowledge_graph_generator.generate_graph_from_text(
            document_text, 
            lambda p: llm_wrapper(p, api_key)
        )
        return jsonify({"success": True, "graph_data": graph_data}), 200
    except Exception as e:
        logger.error(f"Error during on-the-fly KG generation: {e}", exc_info=True)
        return create_error_response(f"KG Generation failed: {str(e)}", 500)

@app.route('/generate_document', methods=['POST'])
def generate_document_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    outline, doc_type, source_text, api_key = data.get('markdownContent'), data.get('docType'), data.get('sourceDocumentText'), data.get('api_key')
    if not all([outline, doc_type, source_text, api_key]): return create_error_response("Missing required fields", 400)
    try:
        expanded_content = document_generator.expand_content_with_llm(outline, source_text, doc_type, lambda p: llm_wrapper(p, api_key))
        slides = document_generator.parse_pptx_json(expanded_content) if doc_type == 'pptx' else document_generator.refined_parse_docx_markdown(expanded_content)
        filename, path = f"gen_{uuid.uuid4()}.{doc_type}", os.path.join(app.config['GENERATED_DOCS_DIR'], f"gen_{uuid.uuid4()}.{doc_type}")
        if doc_type == 'pptx': document_generator.create_ppt(slides, path)
        else: document_generator.create_doc(slides, path, "text_content")
        return jsonify({"success": True, "filename": filename}), 201
    except Exception as e: return create_error_response(f"Failed to generate document: {str(e)}", 500)

@app.route('/download_document/<filename>', methods=['GET'])
def download_document_route(filename):
    if '..' in filename: return create_error_response("Invalid filename.", 400)
    try:
        file_path = os.path.join(app.config['GENERATED_DOCS_DIR'], filename)
        if not os.path.exists(file_path): return create_error_response("File not found.", 404)
        @after_this_request
        def cleanup(response):
            try: os.remove(file_path)
            except OSError as e: logger.error(f"Error deleting temp file {file_path}: {e}")
            return response
        return send_from_directory(app.config['GENERATED_DOCS_DIR'], filename, as_attachment=True)
    except Exception as e:
        return create_error_response("Could not process download request.", 500)

# KG & DB Management Routes
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238
@app.route('/delete_qdrant_document_data', methods=['DELETE'])
def delete_qdrant_data_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, document_name = data.get('user_id'), data.get('document_name') 
<<<<<<< HEAD
    if not user_id or not document_name:
        return create_error_response("Missing 'user_id' or 'document_name'", 400)
    try:
        result = vector_service.delete_document_vectors(user_id, document_name)
        return jsonify(result), 200
    except Exception as e:
        return create_error_response(f"Deletion failed: {str(e)}", 500)

# KG Endpoints
=======
    if not user_id or not document_name: return create_error_response("Missing fields", 400)
    try:
        result = vector_service.delete_document_vectors(user_id, document_name)
        return jsonify(result), 200
    except Exception as e: return create_error_response(f"Deletion failed: {str(e)}", 500)

>>>>>>> cb3980c292a0516451c7d44abf66797c94422238
@app.route('/kg', methods=['POST'])
def add_or_update_kg_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, original_name, nodes, edges = data.get('userId'), data.get('originalName'), data.get('nodes'), data.get('edges')
<<<<<<< HEAD
    if not all([user_id, original_name, isinstance(nodes, list), isinstance(edges, list)]):
        return create_error_response("Missing or invalid fields", 400)
    try:
        result = neo4j_handler.ingest_knowledge_graph(user_id, original_name, nodes, edges)
        return jsonify({"message": "KG ingested", "status": "completed", **result}), 201
    except Exception as e:
        return create_error_response(f"KG ingestion failed: {str(e)}", 500)
=======
    if not all([user_id, original_name, isinstance(nodes, list), isinstance(edges, list)]): return create_error_response("Missing fields", 400)
    try:
        result = neo4j_handler.ingest_knowledge_graph(user_id, original_name, nodes, edges)
        return jsonify({"message": "KG ingested", "status": "completed", **result}), 201
    except Exception as e: return create_error_response(f"KG ingestion failed: {str(e)}", 500)
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238

@app.route('/kg/<user_id>/<path:document_name>', methods=['GET'])
def get_kg_route(user_id, document_name):
    try:
        kg_data = neo4j_handler.get_knowledge_graph(user_id, document_name)
        return jsonify(kg_data) if kg_data else create_error_response("KG not found", 404)
<<<<<<< HEAD
    except Exception as e:
        return create_error_response(f"KG retrieval failed: {str(e)}", 500)
=======
    except Exception as e: return create_error_response(f"KG retrieval failed: {str(e)}", 500)
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238

@app.route('/kg/<user_id>/<path:document_name>', methods=['DELETE'])
def delete_kg_route(user_id, document_name):
    try:
        deleted = neo4j_handler.delete_knowledge_graph(user_id, document_name)
        return jsonify({"message": "KG deleted"}) if deleted else create_error_response("KG not found", 404)
<<<<<<< HEAD
    except Exception as e:
        return create_error_response(f"KG deletion failed: {str(e)}", 500)

if __name__ == '__main__':
    logger.info(f"--- Starting RAG API Service on port {config.API_PORT} ---")
    app.run(host='0.0.0.0', port=config.API_PORT, debug=True)
=======
    except Exception as e: return create_error_response(f"KG deletion failed: {str(e)}", 500)

if __name__ == '__main__':
    logger.info(f"--- Starting RAG API Service on port {config.API_PORT} ---")
    app.run(host='0.0.0.0', port=config.API_PORT, debug=False, threaded=True)
>>>>>>> cb3980c292a0516451c7d44abf66797c94422238
