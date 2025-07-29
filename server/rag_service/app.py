# server/rag_service/app.py
import os
import sys
import traceback
import logging
import atexit
import uuid
import subprocess
import tempfile
import shutil
import json


from flask import Flask, request, jsonify, current_app, send_from_directory, after_this_request
from pydub import AudioSegment
from duckduckgo_search import DDGS
from qdrant_client import models as qdrant_models
>>>>>>> origin/skms

# --- Add server directory to sys.path ---
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import config
config.setup_logging()

# --- Import configurations and services ---
try:
    from vector_db_service import VectorDBService
    import ai_core
    import neo4j_handler 
    from neo4j import exceptions as neo4j_exceptions
    import document_generator
    import podcast_generator
    import academic_search
    import knowledge_graph_generator
    import google.generativeai as genai
except ImportError as e:
    print(f"CRITICAL IMPORT ERROR: {e}.")
    sys.exit(1)

logger = logging.getLogger(__name__)
app = Flask(__name__)

GENERATED_DOCS_DIR = os.path.join(SERVER_DIR, 'generated_docs')
os.makedirs(GENERATED_DOCS_DIR, exist_ok=True)
app.config['GENERATED_DOCS_DIR'] = GENERATED_DOCS_DIR

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

def create_error_response(message, status_code=500, details=None):
    log_message = f"API Error ({status_code}): {message}"
    if details: log_message += f" | Details: {details}"
    current_app.logger.error(log_message)
    response_payload = {"error": message}
    if details and status_code != 500: response_payload["details"] = details
    return jsonify(response_payload), status_code

# === API Endpoints ===

<<<<<<< HEAD
# --- THIS IS THE CORRECTED /query ENDPOINT ---
@app.route('/query', methods=['POST'])
def search_qdrant_documents():
    current_app.logger.info("--- /query Request (RAG Search Only) ---")
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    query_text = data.get('query')
    user_id = data.get('user_id') # user_id is mainly for logging here
    
    if not query_text or not user_id:
        return create_error_response("Missing 'query' or 'user_id'", 400)

    try:
        k = data.get('k', 5)
        document_context_name = data.get('documentContextName')
        
        must_conditions = []
        if document_context_name:
            current_app.logger.info(f"Applying document context filter: '{document_context_name}'")
            must_conditions.append(qdrant_models.FieldCondition(
                key="file_name", # This is the field where originalName is stored in Qdrant metadata
                match=qdrant_models.MatchValue(value=document_context_name)
            ))
        
        # This endpoint no longer handles KG logic. It's purely for Qdrant RAG.
        qdrant_filters = qdrant_models.Filter(must=must_conditions) if must_conditions else None
        
        retrieved_docs, snippet, docs_map = vector_service.search_documents(
            query=query_text, k=k, filter_conditions=qdrant_filters
        )
        
        response_payload = {
            "retrieved_documents_list": [d.to_dict() for d in retrieved_docs],
            "formatted_context_snippet": snippet,
            "retrieved_documents_map": docs_map,
        }
        
        current_app.logger.info(f"RAG search successful. Returning {len(retrieved_docs)} documents.")
        return jsonify(response_payload), 200
        
    except Exception as e:
        logger.error(f"Error in /query (RAG search): {e}", exc_info=True)
        return create_error_response(f"Query failed: {str(e)}", 500)

# All other endpoints remain unchanged and are included for completeness
=======
@app.route('/health', methods=['GET'])
def health_check():
    status_details = { "status": "error", "qdrant_service": "not_initialized", "neo4j_service": "not_initialized_via_handler", "neo4j_connection": "unknown"}
    http_status_code = 503
    if not vector_service:
        status_details["qdrant_service"] = "failed_to_initialize"
    else:
        status_details["qdrant_service"] = "initialized"
        try:
            vector_service.client.get_collection(collection_name=vector_service.collection_name)
            status_details["qdrant_collection_status"] = "exists_and_accessible"
        except Exception as e:
            status_details["qdrant_collection_status"] = f"error: {str(e)}"
    
    neo4j_ok, neo4j_conn_status = neo4j_handler.check_neo4j_connectivity()
    if neo4j_ok:
        status_details["neo4j_service"], status_details["neo4j_connection"] = "initialized_via_handler", "connected"
    else:
        status_details["neo4j_service"], status_details["neo4j_connection"] = "initialization_failed_or_handler_error", neo4j_conn_status
    
    if status_details["qdrant_service"] == "initialized" and status_details.get("qdrant_collection_status") == "exists_and_accessible" and neo4j_ok:
        status_details["status"], http_status_code = "ok", 200
    
    return jsonify(status_details), http_status_code

@app.route('/add_document', methods=['POST'])
def add_document_qdrant():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, file_path, original_name = data.get('user_id'), data.get('file_path'), data.get('original_name')
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
@app.route('/delete_qdrant_document_data', methods=['DELETE'])
def delete_qdrant_data_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, document_name = data.get('user_id'), data.get('document_name') 
    if not user_id or not document_name: return create_error_response("Missing fields", 400)
    try:
        result = vector_service.delete_document_vectors(user_id, document_name)
        return jsonify(result), 200
    except Exception as e: return create_error_response(f"Deletion failed: {str(e)}", 500)

@app.route('/kg', methods=['POST'])
def add_or_update_kg_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, original_name, nodes, edges = data.get('userId'), data.get('originalName'), data.get('nodes'), data.get('edges')
    if not all([user_id, original_name, isinstance(nodes, list), isinstance(edges, list)]): return create_error_response("Missing fields", 400)
    try:
        result = neo4j_handler.ingest_knowledge_graph(user_id, original_name, nodes, edges)
        return jsonify({"message": "KG ingested", "status": "completed", **result}), 201
    except Exception as e: return create_error_response(f"KG ingestion failed: {str(e)}", 500)

@app.route('/kg/<user_id>/<path:document_name>', methods=['GET'])
def get_kg_route(user_id, document_name):
    try:
        kg_data = neo4j_handler.get_knowledge_graph(user_id, document_name)
        return jsonify(kg_data) if kg_data else create_error_response("KG not found", 404)
    except Exception as e: return create_error_response(f"KG retrieval failed: {str(e)}", 500)

@app.route('/kg/<user_id>/<path:document_name>', methods=['DELETE'])
def delete_kg_route(user_id, document_name):
    try:
        deleted = neo4j_handler.delete_knowledge_graph(user_id, document_name)
        return jsonify({"message": "KG deleted"}) if deleted else create_error_response("KG not found", 404)
    except Exception as e: return create_error_response(f"KG deletion failed: {str(e)}", 500)

if __name__ == '__main__':
    logger.info(f"--- Starting RAG API Service on port {config.API_PORT} ---")
    app.run(host='0.0.0.0', port=config.API_PORT, debug=False, threaded=True)
