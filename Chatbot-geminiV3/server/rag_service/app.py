# server/app.py

import os
import sys
import traceback
from flask import Flask, request, jsonify, current_app
import logging

# --- Add server directory to sys.path ---
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

# config.py should call setup_logging() itself.
import config # This executes config.py, including setup_logging()

# --- Import configurations and services ---
try:
    from vector_db_service import VectorDBService
    from neo4j_service import Neo4jService
    from neo4j import exceptions as neo4j_exceptions # Official Neo4j driver exceptions (PLURAL ALIAS)
    import ai_core # Your AI processing module
except ImportError as e:
    # Fallback basic logger for critical import errors
    # Logging might not be fully configured if 'config' import itself failed.
    logging.basicConfig(level=logging.CRITICAL, format='%(asctime)s - %(levelname)s - CRITICAL_IMPORT - %(message)s')
    logging.critical(f"CRITICAL IMPORT ERROR: {e}. Ensure all modules are correctly placed. PYTHONPATH: {sys.path}", exc_info=True)
    sys.exit(1) # Exit if essential components can't be imported

# Get the application logger, configured by config.setup_logging()
logger = logging.getLogger(__name__)
app = Flask(__name__)

# --- Application-Scoped Service Initialization ---
# These services are initialized once when the Flask app object is created.
# They are stored on the 'app' object itself, making them available globally within the app context.

# Initialize VectorDBService
try:
    logger.info("Initializing VectorDBService for the application...")
    app.vector_service_instance = VectorDBService() # Assuming constructor handles setup
    app.vector_service_instance.setup_collection() # Explicit setup call if needed
    logger.info("VectorDBService initialized and attached to app successfully.")
except Exception as e:
    logger.critical(f"Failed to initialize VectorDBService for the application: {e}", exc_info=True)
    app.vector_service_instance = None # Mark as unavailable

# Initialize Neo4jService
try:
    logger.info("Initializing Neo4jService for the application...")
    app.neo4j_service_instance = Neo4jService(
        uri=config.NEO4J_URI,
        user=config.NEO4J_USER,
        password=config.NEO4J_PASSWORD
    )
    logger.info("Neo4jService initialized and attached to app successfully.")
except ConnectionError as e: # Specific error from Neo4jService on connection failure
    logger.critical(f"Failed to initialize Neo4jService (ConnectionError): {e}") # exc_info=False as ConnectionError is informative
    app.neo4j_service_instance = None
except Exception as e: # Other unexpected errors during Neo4jService init
    logger.critical(f"Unexpected error during Neo4jService initialization: {e}", exc_info=True)
    app.neo4j_service_instance = None

# --- Helper for Error Responses ---
def create_error_response(message, status_code=500, details=None):
    response_data = {"error": message}
    if details: response_data["details"] = str(details) # Ensure details are string
    current_app.logger.error(f"API Error ({status_code}): {message}{(' - Details: ' + str(details)) if details else ''}")
    return jsonify(response_data), status_code

@app.teardown_appcontext # <--- CORRECT DECORATOR
def shutdown_services(exception=None): # Renamed from teardown_services for clarity with previous usage
    """Close resources when the Flask app context is torn down."""
    # This will be called when the app context pops, which includes after requests
    # and during app shutdown if a context was active.
    # For truly app-scoped resources closed ONLY on app exit, atexit might be considered,
    # but Flask's app context teardown is standard for such cleanups.

    neo4j_svc = getattr(current_app, 'neo4j_service_instance', None) # Use current_app here
    if neo4j_svc:
        current_app.logger.info("Flask app context tearing down. Closing Neo4j driver.")
        neo4j_svc.close()
        # current_app.neo4j_service_instance = None # Avoid modifying current_app state in teardown like this directly
                                                 # The instance on `app` will persist unless app is restarted.

    qdrant_svc = getattr(current_app, 'vector_service_instance', None)
    if qdrant_svc and hasattr(qdrant_svc, 'close'):
        current_app.logger.info("Flask app context tearing down. Closing Qdrant client.")
        qdrant_svc.close()


# === API Endpoints ===
# Helper to get service instances within request context, ensuring they are initialized
def get_qdrant_service_from_app():
    svc = getattr(current_app, 'vector_service_instance', None)
    if not svc:
        logger.error("Qdrant service not initialized on app object.")
        raise ConnectionError("Qdrant service is not available.")
    return svc

def get_neo4j_service_from_app():
    svc = getattr(current_app, 'neo4j_service_instance', None)
    if not svc:
        logger.error("Neo4j service not initialized on app object.")
        # Optionally, try to re-initialize, but for app-scoped, it should be there if init was successful
        # current_app.neo4j_service_instance = Neo4jService(...)
        raise ConnectionError("Neo4jService is not available.")
    # Double check connectivity before use in a request
    if not svc.check_connectivity():
        logger.warning("Neo4j connectivity lost, attempting to re-establish for current request.")
        svc._connect() # Attempt to re-establish connection
        if not svc.check_connectivity(): # Check again
            raise ConnectionError("Neo4jService lost connection and could not re-establish.")
    return svc


@app.route('/health', methods=['GET'])
def health_check():
    # Logic from your provided app.py, adapted to use getattr for services
    # ... (ensure to use get_qdrant_service_from_app and get_neo4j_service_from_app if needed,
    # or directly check app.vector_service_instance and app.neo4j_service_instance)
    current_app.logger.info("--- Health Check Request ---")
    overall_status = "ok"
    http_status_code = 200
    status_details = {
        "status": overall_status,
        "services": {
            "qdrant": { "status": "error", "service_initialized": False, "collection_name": getattr(config, 'QDRANT_COLLECTION_NAME', 'N/A'), "collection_status": "unknown", "expected_vector_dimension": getattr(config, 'QDRANT_COLLECTION_VECTOR_DIM', 'N/A'), "actual_vector_dimension": "unknown" },
            "neo4j": { "status": "error", "service_initialized": False, "connection_status": "disconnected" }
        },
        "embedding_models": { "document_embedding_model": getattr(config, 'DOCUMENT_EMBEDDING_MODEL_NAME', 'N/A'), "query_embedding_model": getattr(config, 'QUERY_EMBEDDING_MODEL_NAME', 'N/A'), }
    }
    qdrant_health = status_details["services"]["qdrant"]
    qdrant_svc = getattr(app, 'vector_service_instance', None)
    if not qdrant_svc:
        qdrant_health["status"] = "failed_to_initialize"; overall_status = "error"
    else:
        qdrant_health["service_initialized"] = True
        try:
            collection_info = qdrant_svc.client.get_collection(collection_name=qdrant_svc.collection_name)
            qdrant_health["collection_status"] = "exists"
            # ... (rest of your Qdrant health check logic) ...
            actual_dim_val = "unknown"
            if hasattr(collection_info.config.params.vectors, 'size'): actual_dim_val = collection_info.config.params.vectors.size
            elif isinstance(collection_info.config.params.vectors, dict) and '' in collection_info.config.params.vectors : actual_dim_val = collection_info.config.params.vectors[''].size
            qdrant_health["actual_vector_dimension"] = str(actual_dim_val)
            if str(actual_dim_val) == str(config.QDRANT_COLLECTION_VECTOR_DIM): qdrant_health["status"] = "ok"
            else: qdrant_health["status"] = "error_dimension_mismatch"; qdrant_health["collection_status"] += " (Dimension Mismatch)"; overall_status = "error"

        except Exception as e: qdrant_health["status"] = "error_collection_access"; qdrant_health["collection_status"] = f"error: {e}"; overall_status = "error"

    neo4j_health = status_details["services"]["neo4j"]
    neo4j_svc = getattr(app, 'neo4j_service_instance', None)
    if not neo4j_svc:
        neo4j_health["status"] = "failed_to_initialize"; overall_status = "error"
    else:
        neo4j_health["service_initialized"] = True
        if neo4j_svc.check_connectivity(): neo4j_health["status"] = "ok"; neo4j_health["connection_status"] = "connected"
        else: neo4j_health["status"] = "error_connection"; neo4j_health["connection_status"] = "disconnected"; overall_status = "error"
            
    status_details["status"] = overall_status
    if overall_status == "error": http_status_code = 503
    current_app.logger.info(f"Health check completed: {overall_status}")
    return jsonify(status_details), http_status_code


@app.route('/add_document', methods=['POST'])
def add_document_qdrant():
    current_app.logger.info("--- /add_document Request (Qdrant & KG Prep) ---")
    if not request.is_json:
        return create_error_response("Request must be JSON", 400)

    try:
        # Assuming get_qdrant_service_from_app is defined and handles service availability
        qdrant_svc = get_qdrant_service_from_app() # Or your actual helper name
    except ConnectionError as e: # If the helper raises ConnectionError when service is unavailable
        current_app.logger.error(f"Failed to get Qdrant service: {e}")
        return create_error_response(f"VectorDBService (Qdrant) is not available: {e}", 503)

    data = request.get_json()
    user_id = data.get('user_id')
    file_path = data.get('file_path') # Path ON THE SERVER where Node.js has placed/uploaded the file
    original_name = data.get('original_name')

    if not all([user_id, file_path, original_name]):
        return create_error_response("Missing required fields: user_id, file_path, original_name", 400)

    current_app.logger.info(f"Processing document: '{original_name}' (Path: '{file_path}') for user: '{user_id}'")

    if not os.path.exists(file_path): # Critical check for the file path received from Node.js
        current_app.logger.error(f"File not found at server path: {file_path} for document '{original_name}'")
        return create_error_response(f"File not found at server path: {file_path}", 404)

    try:
        current_app.logger.info(f"Calling ai_core to process document: '{original_name}' for embedding and KG data extraction.")
        # Expecting three return values from ai_core:
        # 1. Chunks ready for Qdrant (with embeddings)
        # 2. Raw text for general analysis/logging
        # 3. Metadata structured for KG creation (this might be raw text chunks, entities, summaries, etc.)
        processed_chunks_with_embeddings, raw_text_for_node_analysis, chunks_with_metadata_for_kg = ai_core.process_document_for_qdrant(
            file_path=file_path,
            original_name=original_name,
            user_id=user_id
            # You might need to pass other config like chunk_size, overlap if ai_core doesn't get them from config
        )
        
        num_chunks_added_to_qdrant = 0
        # Define a clear default status. This status means ai_core ran but produced nothing useful for Qdrant or KG.
        processing_status = "processed_no_actionable_content" 

        if processed_chunks_with_embeddings:
            current_app.logger.info(f"ai_core generated {len(processed_chunks_with_embeddings)} embedding chunks for '{original_name}'. Adding to Qdrant.")
            num_chunks_added_to_qdrant = qdrant_svc.add_processed_chunks(processed_chunks_with_embeddings)
            
            if num_chunks_added_to_qdrant > 0:
                processing_status = "added" # Changed to match assumed Node.js expectation
                current_app.logger.info(f"Successfully added {num_chunks_added_to_qdrant} chunks from '{original_name}' to Qdrant. Status: {processing_status}")
            else:
                processing_status = "processed_qdrant_chunks_not_added" # If chunks were processed but 0 added (e.g., all duplicates)
                current_app.logger.info(f"Processed embedding chunks for '{original_name}' but 0 were added to Qdrant (e.g., duplicates or filter). Status: {processing_status}")
        
        # This 'elif' condition is for cases where no embeddings were made for Qdrant,
        # but other processing (like text extraction for KG or just logging) happened.
        elif raw_text_for_node_analysis or chunks_with_metadata_for_kg:
            processing_status = "processed_for_kg_or_analysis_only" # No Qdrant action, but other data produced
            current_app.logger.info(f"No embedding chunks for Qdrant from '{original_name}', but other data (raw text/KG metadata) was extracted. Status: {processing_status}")
        
        # If after all processing, no useful output for Qdrant, KG, or raw text, it's effectively 'no_content_extracted'
        if not processed_chunks_with_embeddings and not raw_text_for_node_analysis and not chunks_with_metadata_for_kg:
            processing_status = "no_content_extracted"
            current_app.logger.warning(f"ai_core produced no RAG chunks, no raw text, and no KG metadata for '{original_name}'. Status: {processing_status}")
            # For this case, you might still return 200 or 201 but with a clear message.
            # The current structure will fall through to the main response_payload.

        response_payload = {
            "message": f"Document processing for '{original_name}' completed.", # General message
            "status": processing_status, # The determined status
            "filename": original_name,
            "user_id": user_id,
            "num_chunks_added_to_qdrant": num_chunks_added_to_qdrant,
            "raw_text_for_analysis": raw_text_for_node_analysis if raw_text_for_node_analysis is not None else "",
            "chunks_with_metadata": chunks_with_metadata_for_kg if chunks_with_metadata_for_kg else [] # Corrected key
        }
        current_app.logger.info(f"Successfully processed '{original_name}'. Response payload: {response_payload}")
        return jsonify(response_payload), 201 # 201 indicates resource (or its processed form) was created/updated

    except config.TESSERACT_ERROR as te: # Catch specific Tesseract error
        current_app.logger.critical(f"/add_document Error - Tesseract OCR not found/configured for '{original_name}': {te}", exc_info=True)
        return create_error_response("OCR engine (Tesseract) not found or not configured correctly on the server.", 500, details=str(te))
    except ValueError as ve: # e.g., vector dimension mismatch from Qdrant or bad input to a function
        current_app.logger.error(f"/add_document Error - ValueError for '{original_name}': {ve}", exc_info=True)
        return create_error_response(f"Configuration or data processing error: {str(ve)}", 400, details=str(ve))
    except Exception as e: # Catch-all for other unexpected errors during processing
        current_app.logger.error(f"/add_document Error - Unexpected Exception for '{original_name}': {e}", exc_info=True)
        return create_error_response(f"Failed to process document '{original_name}' due to an internal server error.", 500, details=str(e))


# server/app.py

# ... (other imports, get_qdrant_service_from_app helper) ...

@app.route('/query', methods=['POST'])
def search_qdrant_documents():
    current_app.logger.info("--- /query Request (Qdrant) ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    try:
        qdrant_svc = get_qdrant_service_from_app() # Your helper to get the service
    except ConnectionError as e:
        current_app.logger.error(f"Failed to get Qdrant service for /query: {e}")
        return create_error_response(str(e), 503)
    
    data = request.get_json()
    query_text = data.get('query')
    k = data.get('k', config.QDRANT_DEFAULT_SEARCH_K)
    filter_payload = data.get('filter') # From Node.js: payload.filter = filter;

    if not query_text: return create_error_response("Missing 'query' field", 400)
    try:
        k = int(k)
        if k <= 0: raise ValueError("'k' must be a positive integer.")
    except ValueError as e:
        return create_error_response(str(e), 400)

    qdrant_filters = None
    if filter_payload and isinstance(filter_payload, dict) and len(filter_payload) > 0:
        try:
            from qdrant_client import models as qdrant_models # Keep import local
            conditions = []
            # Example: if filter_payload is {"must": [{"key": "city", "match": {"value": "London"}}]}
            # Adapt this based on the actual structure of filter_payload sent by Node.js
            # For now, assuming a simple key-value filter_payload like {"source_document": "tom.txt"}
            for key, value in filter_payload.items():
                 # Qdrant's MatchValue is for exact matches. Adjust if other match types are needed.
                conditions.append(qdrant_models.FieldCondition(key=f"metadata.{key}", match=qdrant_models.MatchValue(value=value)))
            
            if conditions:
                qdrant_filters = qdrant_models.Filter(must=conditions)
                current_app.logger.info(f"Applying Qdrant filter from payload: {qdrant_filters.dict()}")
        except Exception as e_filter:
            current_app.logger.error(f"Error constructing Qdrant filter: {e_filter}", exc_info=True)
            return create_error_response("Error processing filter conditions.", 400, details=str(e_filter))
    else:
        current_app.logger.info("No valid filter payload provided or filter is empty.")


    try:
        # EXPECTATION: qdrant_svc.search_documents returns:
        # 1. docs: A list of objects, where each object has at least 'id', 'score', and 'payload'
        #          (and 'payload' is a dict containing 'page_content', 'original_name', etc.)
        #          OR each object has 'id', 'score', 'page_content', and 'metadata' (where 'metadata' has 'original_name')
        # 2. formatted_context: A string (not directly used by Node.js for adapting docs)
        # 3. docs_map: A dictionary (not directly used by Node.js for adapting docs for Gemini context)

        docs_from_service, formatted_context_snippet, docs_map_details = qdrant_svc.search_documents(
            query=query_text, k=k, filter_conditions=qdrant_filters # Pass the qdrant_filters object
        )

        # SERIALIZE for JSON response - this list will become `response.data.retrieved_documents_list` in Node.js
        serialized_docs_for_list = []
        if docs_from_service:
            current_app.logger.debug(f"Serializing {len(docs_from_service)} docs from qdrant_svc.search_documents")
            for point in docs_from_service:
                # Standardize the structure for Node.js
                # Node.js expects to find 'score' at the top level,
                # and 'page_content' and 'original_name' (etc.) within a sub-object.
                # Qdrant's ScoredPoint has 'id', 'version', 'score', 'payload', 'vector'.
                # We will send 'id', 'score', and the 'payload'.
                
                if hasattr(point, 'payload') and hasattr(point, 'score') and hasattr(point, 'id'):
                    # This looks like a Qdrant ScoredPoint or similar structure
                    serialized_doc = {
                        "id": str(point.id), # Qdrant ID (string or int, convert to string for safety)
                        "score": float(point.score),
                        "payload": point.payload if point.payload is not None else {} # Ensure payload is at least an empty dict
                    }
                    # Ensure page_content is in the payload for Node.js
                    if 'page_content' not in serialized_doc['payload'] and serialized_doc['payload'].get('text_content'):
                        serialized_doc['payload']['page_content'] = serialized_doc['payload']['text_content']
                    elif 'page_content' not in serialized_doc['payload'] and serialized_doc['payload'].get('content'):
                         serialized_doc['payload']['page_content'] = serialized_doc['payload']['content']

                    serialized_docs_for_list.append(serialized_doc)
                elif hasattr(point, 'model_dump'): # Pydantic v2+ model
                    serialized_docs_for_list.append(point.model_dump())
                elif hasattr(point, 'dict'): # Pydantic v1.x model
                    serialized_docs_for_list.append(point.dict())
                else:
                    current_app.logger.warning(f"Document from qdrant_svc.search_documents has an unexpected type: {type(point)}. Converting to string as fallback.")
                    serialized_docs_for_list.append(str(point)) # Fallback, Node.js will likely fail to parse this meaningfully

        current_app.logger.info(f"Qdrant search successful. Returning {len(serialized_docs_for_list)} serialized documents in list.")
        
        return jsonify({
            "query": query_text,
            "k_requested": k,
            "results_count": len(serialized_docs_for_list), # Count of docs successfully serialized
            "formatted_context_snippet": formatted_context_snippet, # Keeping for potential direct use or debugging
            "retrieved_documents_map": docs_map_details,         # Keeping for potential direct use or debugging
            "retrieved_documents_list": serialized_docs_for_list # This is the key list for Node.js
        }), 200
        
    except neo4j_exceptions.Neo4jError as ne: # If search_documents unexpectedly calls Neo4j
        current_app.logger.error(f"Neo4jError during Qdrant search (unexpected): {ne}", exc_info=True)
        return create_error_response("Unexpected Neo4j error during search.", 500, details=str(ne))
    except ConnectionError as ce: # If get_qdrant_service_from_app fails within search_documents
        current_app.logger.error(f"ConnectionError during Qdrant search: {ce}", exc_info=True)
        return create_error_response("Qdrant connection error during search.", 503, details=str(ce))
    except Exception as e:
        current_app.logger.error(f"General error during Qdrant search for query '{query_text}': {e}", exc_info=True)
        return create_error_response("Error during Qdrant search.", 500, details=str(e))



@app.route('/delete', methods=['POST'])
def delete_document_embeddings_route():
    current_app.logger.info("--- /delete Request (Qdrant) ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    try:
        qdrant_svc = get_qdrant_service_from_app()
    except ConnectionError as e:
        return create_error_response(str(e), 503)
        
    data = request.get_json() # ... (rest of your delete logic using qdrant_svc)
    user_id, original_name = data.get('user_id'), data.get('original_name')
    if not all([user_id, original_name]): return create_error_response("Missing required fields", 400)
    try:
        deleted_count = qdrant_svc.delete_document_embeddings(user_id=user_id, original_name=original_name)
        status_msg = "deleted" if deleted_count > 0 else "not_found_or_already_deleted"
        return jsonify({"message": f"Embeddings for '{original_name}' by user '{user_id}'.", "deleted_count": deleted_count, "status": status_msg}), 200
    except Exception as e:
        current_app.logger.error(f"Error deleting Qdrant embeddings for '{original_name}': {e}", exc_info=True)
        return create_error_response(f"Failed to delete embeddings for '{original_name}'.", 500, details=str(e))


# --- Neo4j KG Endpoints ---
@app.route("/kg", methods=["POST"])
def add_kg_route():
    current_app.logger.info("--- /kg POST Request (Neo4j) ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    try:
        neo4j_svc = get_neo4j_service_from_app()
    except ConnectionError as e:
        return create_error_response(str(e), 503)

    data = request.get_json()
    user_id, original_name = data.get("user_id"), data.get("original_name")
    nodes_data, edges_data = data.get("nodes", []), data.get("edges", [])
    if not user_id or not original_name: return create_error_response("user_id and original_name are required", 400)
    if not (isinstance(nodes_data, list) and isinstance(edges_data, list)): return create_error_response("'nodes' and 'edges' must be lists", 400)
    current_app.logger.info(f"Adding/updating KG for user '{user_id}', doc '{original_name}' ({len(nodes_data)} nodes, {len(edges_data)} edges).")
    try:
        result = neo4j_svc.add_knowledge_graph(user_id, original_name, nodes_data, edges_data)
        return jsonify(result), 201
    except neo4j_exceptions.Neo4jError as e: # Catch specific Neo4j errors
        return create_error_response("Neo4j database operation failed.", 500, details=str(e))
    except ConnectionError as e: # Catch if get_driver in service fails after initial connect
        return create_error_response(f"Neo4j connection issue: {str(e)}", 503, details=str(e))
    except Exception as e:
        return create_error_response("An unexpected error occurred during KG creation.", 500, details=str(e))

@app.route("/kg/<user_id>/<path:document_name>", methods=["GET"])
def get_kg_route(user_id, document_name):
    current_app.logger.info(f"--- /kg GET Request for user '{user_id}', doc '{document_name}' ---")
    try:
        neo4j_svc = get_neo4j_service_from_app()
    except ConnectionError as e:
        return create_error_response(str(e), 503)
    try:
        kg_data = neo4j_svc.get_knowledge_graph(user_id, document_name)
        if kg_data: return jsonify(kg_data), 200
        else: return create_error_response("Knowledge graph not found.", 404)
    except neo4j_exceptions.Neo4jError as e:
        return create_error_response("Neo4j database query failed.", 500, details=str(e))
    except ConnectionError as e:
        return create_error_response(f"Neo4j connection issue: {str(e)}", 503, details=str(e))
    except Exception as e:
        return create_error_response("An unexpected error occurred retrieving KG.", 500, details=str(e))

@app.route("/kg/<user_id>/<path:document_name>", methods=["DELETE"])
def delete_kg_route(user_id, document_name):
    current_app.logger.info(f"--- /kg DELETE Request for user '{user_id}', doc '{document_name}' ---")
    try:
        neo4j_svc = get_neo4j_service_from_app()
    except ConnectionError as e:
        return create_error_response(str(e), 503)
    try:
        result = neo4j_svc.delete_knowledge_graph(user_id, document_name)
        if result.get("status") == "deleted": return jsonify(result), 200
        elif result.get("status") == "not_found": return create_error_response(result.get("message"), 404)
        else: return jsonify(result), 200 # Or handle unexpected status
    except neo4j_exceptions.Neo4jError as e:
        return create_error_response("Neo4j database deletion failed.", 500, details=str(e))
    except ConnectionError as e:
        return create_error_response(f"Neo4j connection issue: {str(e)}", 503, details=str(e))
    except Exception as e:
        return create_error_response("An unexpected error occurred deleting KG.", 500, details=str(e))

# === Main Execution ===
if __name__ == '__main__':
    api_port = getattr(config, 'API_PORT', 5000)
    logger.info(f"--- Starting RAG API Service on port {api_port} ---")
    
    # Log status after initialization attempts
    if getattr(app, 'vector_service_instance', None): logger.info("Qdrant Service: Initialized")
    else: logger.warning("Qdrant Service: FAILED TO INITIALIZE / NOT AVAILABLE")
    if getattr(app, 'neo4j_service_instance', None): logger.info(f"Neo4j Service: Initialized (URI: {config.NEO4J_URI})")
    else: logger.warning("Neo4j Service: FAILED TO INITIALIZE / NOT AVAILABLE")

    app.run(host='0.0.0.0', port=api_port, debug=True)