# server/main_qdrant_app.py

import os
import sys
import traceback # For detailed error logging
from flask import Flask, request, jsonify, current_app
import logging

# --- Add server directory to sys.path ---
# This allows us to import modules from the 'server' directory and sub-packages like 'rag_service'
# Assumes this file (main_qdrant_app.py) is in the 'server/' directory.
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import config # Should pick up server/config.py
config.setup_logging()


# --- Import configurations and services ---
try:
    from vector_db_service import VectorDBService # From server/vector_db_service.py
    import ai_core # From server/rag_service/ai_core.py
except ImportError as e:
    print(f"CRITICAL IMPORT ERROR: {e}. Ensure all modules are correctly placed and server directory is in PYTHONPATH.")
    print("PYTHONPATH:", sys.path)
    sys.exit(1)

logger = logging.getLogger(__name__)
app = Flask(__name__)

# --- Initialize VectorDBService ---
vector_service = None
try:
    logger.info("Initializing VectorDBService for Qdrant...")
    vector_service = VectorDBService()
    vector_service.setup_collection() # Create/validate Qdrant collection on startup
    logger.info("VectorDBService initialized and collection setup successfully.")
except Exception as e:
    logger.critical(f"Failed to initialize VectorDBService or setup Qdrant collection: {e}", exc_info=True)
    # Application might be non-functional, consider exiting or running in a degraded state
    # For now, vector_service will be None, and endpoints will fail gracefully.

# --- Helper for Error Responses ---
def create_error_response(message, status_code=500):
    current_app.logger.error(f"API Error ({status_code}): {message}")
    return jsonify({"error": message}), status_code

# === API Endpoints ===

@app.route('/health', methods=['GET'])
def health_check():
    current_app.logger.info("--- Health Check Request ---")
    status_details = {
        "status": "error",
        "qdrant_service": "not_initialized",
        "qdrant_collection_name": config.QDRANT_COLLECTION_NAME,
        "qdrant_collection_status": "unknown",
        "document_embedding_model": config.DOCUMENT_EMBEDDING_MODEL_NAME,
        "query_embedding_model": config.QUERY_EMBEDDING_MODEL_NAME,
        "expected_vector_dimension": config.QDRANT_COLLECTION_VECTOR_DIM,
    }
    http_status_code = 503

    if not vector_service:
        status_details["qdrant_service"] = "failed_to_initialize"
        return jsonify(status_details), http_status_code

    status_details["qdrant_service"] = "initialized"
    try:
        collection_info = vector_service.client.get_collection(collection_name=vector_service.collection_name)
        status_details["qdrant_collection_status"] = "exists"
        if hasattr(collection_info.config.params.vectors, 'size'): # Simple vector config
             actual_dim = collection_info.config.params.vectors.size
        elif isinstance(collection_info.config.params.vectors, dict): # Named vectors
            default_vector_conf = collection_info.config.params.vectors.get('')
            actual_dim = default_vector_conf.size if default_vector_conf else "multiple_named_not_checked"
        else:
            actual_dim = "unknown_format"

        status_details["actual_vector_dimension"] = actual_dim
        if actual_dim == config.QDRANT_COLLECTION_VECTOR_DIM:
            status_details["status"] = "ok"
            http_status_code = 200
            current_app.logger.info("Health check successful.")
        else:
            status_details["qdrant_collection_status"] = f"exists_with_dimension_mismatch (Expected {config.QDRANT_COLLECTION_VECTOR_DIM}, Got {actual_dim})"
            current_app.logger.warning(f"Health check: Qdrant dimension mismatch.")

    except Exception as e:
        status_details["qdrant_collection_status"] = f"error_accessing_collection: {str(e)}"
        current_app.logger.error(f"Health check: Error accessing Qdrant collection: {e}", exc_info=True)

    return jsonify(status_details), http_status_code


@app.route('/add_document', methods=['POST'])
def add_document_qdrant():
    current_app.logger.info("--- /add_document Request (Qdrant) ---")
    if not request.is_json:
        return create_error_response("Request must be JSON", 400)

    if not vector_service:
        return create_error_response("VectorDBService (Qdrant) is not available.", 503)

    data = request.get_json()
    user_id = data.get('user_id')
    # file_path is path ON THE SERVER where Flask can access it.
    # In a real system, this often comes from a file upload process that saves the file first.
    file_path = data.get('file_path')
    original_name = data.get('original_name') # Original filename from client

    if not all([user_id, file_path, original_name]):
        return create_error_response("Missing required fields: user_id, file_path, original_name", 400)

    current_app.logger.info(f"Processing file: '{original_name}' (Path: '{file_path}') for user: '{user_id}'")

    if not os.path.exists(file_path):
        current_app.logger.error(f"File not found at server path: {file_path}")
        return create_error_response(f"File not found at server path: {file_path}", 404)

    try:
        # Assuming ai_core.process_document_for_embeddings is updated to return two values,
        # or you have a new function like ai_core.process_document_for_qdrant
        current_app.logger.info(f"Calling ai_core to process document: '{original_name}'")
        processed_chunks_with_embeddings, raw_text_for_node_analysis = ai_core.process_document_for_qdrant(
            file_path=file_path,
            original_name=original_name,
            user_id=user_id
        )
        # If you kept the old function name and just changed its return:
        # processed_chunks_with_embeddings, raw_text_for_node_analysis = ai_core.process_document_for_embeddings(...)

        num_chunks_added_to_qdrant = 0
        processing_status = "processed_no_content"

        # Check if chunks were generated before trying to add them
        if processed_chunks_with_embeddings:
            current_app.logger.info(f"ai_core generated {len(processed_chunks_with_embeddings)} chunks for '{original_name}'. Adding to Qdrant.")
            # Ensure vector_service is used correctly here
            num_chunks_added_to_qdrant = current_app.vector_service.add_processed_chunks(processed_chunks_with_embeddings)
            if num_chunks_added_to_qdrant > 0:
                processing_status = "added"
                current_app.logger.info(f"Successfully added {num_chunks_added_to_qdrant} chunks from '{original_name}' to Qdrant.")
            else:
                processing_status = "processed_chunks_not_added"
        elif raw_text_for_node_analysis: # If no chunks, but raw text was extracted
            current_app.logger.info(f"ai_core produced no processable RAG chunks for '{original_name}', but raw text was extracted.")
            processing_status = "processed_for_analysis_only" # No RAG chunks, but text for analysis
        else: # No chunks and no raw text (e.g., empty or unparseable file)
            current_app.logger.warning(f"ai_core produced no RAG chunks and no raw text for '{original_name}'.")
            # Return a specific response indicating nothing useful was extracted
            return jsonify({
                "message": f"Processed '{original_name}' but no content was extracted for RAG or analysis.",
                "status": "no_content_extracted",
                "filename": original_name,
                "user_id": user_id,
                "num_chunks_added_to_qdrant": 0,
                "raw_text_for_analysis": "" # Empty string
            }), 200 # 200 OK as the processing attempt itself didn't fail

        # Construct the success response for Node.js
        response_payload = {
            "message": f"Successfully processed '{original_name}'. Embeddings operation completed.",
            "status": processing_status,
            "filename": original_name,
            "user_id": user_id,
            "num_chunks_added_to_qdrant": num_chunks_added_to_qdrant,
            "raw_text_for_analysis": raw_text_for_node_analysis if raw_text_for_node_analysis is not None else "" # Ensure it's always a string
        }
        current_app.logger.info(f"Successfully processed '{original_name}'. Returning raw text and Qdrant status.")
        return jsonify(response_payload), 201 # 201 Created if resources (chunks) were made

    except FileNotFoundError as e:
        current_app.logger.error(f"Add Document Error for '{original_name}' - FileNotFoundError: {e}", exc_info=True)
        return create_error_response(f"File not found during processing: {str(e)}", 404)
    except config.TESSERACT_ERROR: # Make sure config is imported and TESSERACT_ERROR is defined
        current_app.logger.critical(f"Add Document Error for '{original_name}' - Tesseract (OCR) not found.")
        return create_error_response("OCR engine (Tesseract) not found or not configured correctly on the server.", 500)
    except ValueError as e: # e.g., vector dimension mismatch from add_processed_chunks
        current_app.logger.error(f"Add Document Error for '{original_name}' - ValueError: {e}", exc_info=True)
        return create_error_response(f"Configuration or data error: {str(e)}", 400)
    except Exception as e:
        current_app.logger.error(f"Add Document Error for '{original_name}' - Unexpected Exception: {e}\n{traceback.format_exc()}", exc_info=True) # Ensure traceback is imported
        return create_error_response(f"Failed to process document '{original_name}' due to an internal error.", 500)


@app.route('/query', methods=['POST']) # Changed from /query to /search for Qdrant context
def search_qdrant_documents():
    current_app.logger.info("--- /search Request (Qdrant) ---")
    if not request.is_json:
        return create_error_response("Request must be JSON", 400)

    if not vector_service:
        return create_error_response("VectorDBService (Qdrant) is not available.", 503)

    data = request.get_json()
    query_text = data.get('query')
    k = data.get('k', config.QDRANT_DEFAULT_SEARCH_K) # Use default from config
    
    # Optional: Allow passing filter conditions in the request body
    # Example filter: {"user_id": "some_user", "original_name": "some_doc.pdf"}
    filter_payload = data.get('filter') 
    qdrant_filters = None

    if filter_payload and isinstance(filter_payload, dict):
        from qdrant_client import models as qdrant_models # Import here to keep it local
        conditions = []
        for key, value in filter_payload.items():
            # Ensure key is a valid payload key you store (e.g., user_id, original_name, page_number)
            # This simple example assumes exact match for string values.
            # For numerical ranges or other conditions, qdrant_models.Range, etc. would be used.
            conditions.append(qdrant_models.FieldCondition(key=key, match=qdrant_models.MatchValue(value=value)))
        
        if conditions:
            qdrant_filters = qdrant_models.Filter(must=conditions)
            current_app.logger.info(f"Applying Qdrant filter: {filter_payload}")


    if not query_text:
        return create_error_response("Missing 'query' field in request body", 400)

    try:
        k = int(k)
    except ValueError:
        return create_error_response("'k' must be an integer", 400)

    current_app.logger.info(f"Performing Qdrant search for query (first 100 chars): '{query_text[:100]}...' with k={k}")

    try:
        # `search_documents` returns: docs_list, formatted_context_string, context_map
        docs, formatted_context, docs_map = vector_service.search_documents(
            query=query_text,
            k=k,
            filter_conditions=qdrant_filters
        )

        # The response from your original /query endpoint was `{"relevantDocs": [...]}`
        # Let's adapt to return something similar, but with more Qdrant-style info.
        # `docs` is a list of `Document` objects from `vector_db_service`.
        
        response_payload = {
            "query": query_text,
            "k_requested": k,
            "filter_applied": filter_payload, # Show what filter was used
            "results_count": len(docs),
            "formatted_context_snippet": formatted_context, # The RAG-style formatted string
            "retrieved_documents_map": docs_map, # The map with citation index as key
            "retrieved_documents_list": [doc.to_dict() for doc in docs] # List of Document objects as dicts
        }
        current_app.logger.info(f"Qdrant search successful. Returning {len(docs)} results.")
        return jsonify(response_payload), 200

    except Exception as e:
        current_app.logger.error(f"Qdrant search failed: {e}\n{traceback.format_exc()}")
        return create_error_response(f"Error during Qdrant search: {str(e)}", 500)


if __name__ == '__main__':
    logger.info(f"--- Starting Qdrant RAG API Service on port {config.API_PORT} ---")
    logger.info(f"Document Embedding Model (ai_core): {config.DOCUMENT_EMBEDDING_MODEL_NAME} (Dim: {config.DOCUMENT_VECTOR_DIMENSION})")
    logger.info(f"Query Embedding Model (vector_db_service): {config.QUERY_EMBEDDING_MODEL_NAME} (Dim: {config.QUERY_VECTOR_DIMENSION})")
    logger.info(f"Qdrant Collection: {config.QDRANT_COLLECTION_NAME} (Expected Dim: {config.QDRANT_COLLECTION_VECTOR_DIM})")
    
    # For production, use a proper WSGI server like gunicorn or waitress
    # Example: gunicorn --workers 4 --bind 0.0.0.0:5000 main_qdrant_app:app
    app.run(host='0.0.0.0', port=config.API_PORT, debug=True) # debug=True for development