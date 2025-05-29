# server/rag_service/app.py

import os
import sys
import traceback
from flask import Flask, request, jsonify, current_app
import logging
import atexit # For graceful shutdown

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
    from neo4j import exceptions as neo4j_exceptions # For specific error handling
except ImportError as e:
    print(f"CRITICAL IMPORT ERROR: {e}. Ensure all modules are correctly placed and server directory is in PYTHONPATH.")
    print("PYTHONPATH:", sys.path)
    sys.exit(1)

logger = logging.getLogger(__name__)
app = Flask(__name__)

# --- Initialize VectorDBService (Qdrant) ---
vector_service = None
try:
    logger.info("Initializing VectorDBService for Qdrant...")
    vector_service = VectorDBService()
    vector_service.setup_collection()
    app.vector_service = vector_service
    logger.info("VectorDBService initialized and Qdrant collection setup successfully.")
except Exception as e:
    logger.critical(f"Failed to initialize VectorDBService or setup Qdrant collection: {e}", exc_info=True)
    app.vector_service = None

# --- Initialize Neo4j Driver (via handler) ---
try:
    neo4j_handler.init_driver() # Initialize Neo4j driver on app start
except Exception as e:
    logger.critical(f"Neo4j driver failed to initialize on startup: {e}. KG endpoints will likely fail.")
    # Depending on how critical Neo4j is, you might sys.exit(1) here.

# Register Neo4j driver close function for app exit
atexit.register(neo4j_handler.close_driver)


# --- Helper for Error Responses ---
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

@app.route('/health', methods=['GET'])
def health_check():
    current_app.logger.info("--- Health Check Request ---")
    # ... (Qdrant health check part from your existing code) ...
    status_details = {
        "status": "error",
        "qdrant_service": "not_initialized",
        "qdrant_collection_name": config.QDRANT_COLLECTION_NAME,
        "qdrant_collection_status": "unknown",
        "document_embedding_model": config.DOCUMENT_EMBEDDING_MODEL_NAME,
        "query_embedding_model": config.QUERY_EMBEDDING_MODEL_NAME,
        "neo4j_service": "not_initialized_via_handler", # Updated message
        "neo4j_connection": "unknown"
    }
    http_status_code = 503

    # Qdrant Check
    if not vector_service:
        status_details["qdrant_service"] = "failed_to_initialize"
    else:
        status_details["qdrant_service"] = "initialized"
        try:
            vector_service.client.get_collection(collection_name=vector_service.collection_name)
            status_details["qdrant_collection_status"] = "exists_and_accessible"
        except Exception as e:
            status_details["qdrant_collection_status"] = f"error_accessing_collection: {str(e)}"
            current_app.logger.error(f"Health check: Error accessing Qdrant collection: {e}", exc_info=False)
    
    # Neo4j Check
    neo4j_ok, neo4j_conn_status = neo4j_handler.check_neo4j_connectivity()
    if neo4j_ok:
        status_details["neo4j_service"] = "initialized_via_handler"
        status_details["neo4j_connection"] = "connected"
    else:
        status_details["neo4j_service"] = "initialization_failed_or_handler_error"
        status_details["neo4j_connection"] = neo4j_conn_status


    if status_details["qdrant_service"] == "initialized" and \
       status_details["qdrant_collection_status"] == "exists_and_accessible" and \
       neo4j_ok: # Check the boolean return from neo4j_handler
        status_details["status"] = "ok"
        http_status_code = 200
        current_app.logger.info("Health check successful (Qdrant & Neo4j).")
    else:
        current_app.logger.warning(f"Health check issues found: Qdrant service: {status_details['qdrant_service']}, Qdrant collection: {status_details['qdrant_collection_status']}, Neo4j service: {status_details['neo4j_service']}, Neo4j connection: {status_details['neo4j_connection']}")
        
    return jsonify(status_details), http_status_code

@app.route('/add_document', methods=['POST'])
def add_document_qdrant():
    # ... (your existing /add_document endpoint logic)
    # This remains unchanged as it deals with Qdrant.
    current_app.logger.info("--- /add_document Request (Qdrant) ---")
    if not request.is_json:
        return create_error_response("Request must be JSON", 400)

    if not vector_service:
        return create_error_response("VectorDBService (Qdrant) is not available.", 503)

    data = request.get_json()
    user_id = data.get('user_id')
    file_path = data.get('file_path')
    original_name = data.get('original_name')

    if not all([user_id, file_path, original_name]):
        return create_error_response("Missing required fields: user_id, file_path, original_name", 400)

    current_app.logger.info(f"Processing file: '{original_name}' (Path: '{file_path}') for user: '{user_id}' for Qdrant")

    if not os.path.exists(file_path):
        current_app.logger.error(f"File not found at server path: {file_path}")
        return create_error_response(f"File not found at server path: {file_path}", 404)

    try:
        current_app.logger.info(f"Calling ai_core to process document: '{original_name}' for Qdrant")
        # ai_core.process_document_for_qdrant returns: processed_chunks_with_embeddings, raw_text_for_node_analysis, chunks_with_metadata
        processed_chunks_with_embeddings, raw_text_for_node_analysis, chunks_with_metadata_for_kg = ai_core.process_document_for_qdrant(
            file_path=file_path,
            original_name=original_name,
            user_id=user_id
        )
        
        num_chunks_added_to_qdrant = 0
        processing_status = "processed_no_content_for_qdrant"

        if processed_chunks_with_embeddings:
            current_app.logger.info(f"ai_core generated {len(processed_chunks_with_embeddings)} chunks for '{original_name}'. Adding to Qdrant.")
            num_chunks_added_to_qdrant = app.vector_service.add_processed_chunks(processed_chunks_with_embeddings)
            if num_chunks_added_to_qdrant > 0:
                processing_status = "added_to_qdrant"
            else:
                processing_status = "processed_qdrant_chunks_not_added"
        elif raw_text_for_node_analysis:
             current_app.logger.info(f"ai_core produced no processable Qdrant chunks for '{original_name}', but raw text was extracted.")
             processing_status = "processed_for_analysis_only_no_qdrant"
        else:
            current_app.logger.warning(f"ai_core produced no Qdrant chunks and no raw text for '{original_name}'.")
            return jsonify({
                "message": f"Processed '{original_name}' but no content was extracted for Qdrant or analysis.",
                "status": "no_content_extracted",
                "filename": original_name,
                "user_id": user_id,
                "num_chunks_added_to_qdrant": 0,
                "raw_text_for_analysis": ""
            }), 200

        response_payload = {
            "message": f"Successfully processed '{original_name}' for Qdrant. Status: {processing_status}.",
            "status": "added",
            "filename": original_name,
            "user_id": user_id,
            "num_chunks_added_to_qdrant": num_chunks_added_to_qdrant,
            "raw_text_for_analysis": raw_text_for_node_analysis if raw_text_for_node_analysis is not None else "",
            "chunks_with_metadata": chunks_with_metadata_for_kg # Pass this to Node.js for KG worker
        }
        current_app.logger.info(f"Successfully processed '{original_name}' for Qdrant. Returning raw text and Qdrant status.")
        return jsonify(response_payload), 201

    except FileNotFoundError as e:
        current_app.logger.error(f"Add Document (Qdrant) Error for '{original_name}' - FileNotFoundError: {e}", exc_info=True)
        return create_error_response(f"File not found during Qdrant processing: {str(e)}", 404)
    except config.TESSERACT_ERROR:
        current_app.logger.critical(f"Add Document (Qdrant) Error for '{original_name}' - Tesseract (OCR) not found.")
        return create_error_response("OCR engine (Tesseract) not found or not configured correctly on the server.", 500)
    except ValueError as e:
        current_app.logger.error(f"Add Document (Qdrant) Error for '{original_name}' - ValueError: {e}", exc_info=True)
        return create_error_response(f"Configuration or data error for Qdrant: {str(e)}", 400)
    except Exception as e:
        current_app.logger.error(f"Add Document (Qdrant) Error for '{original_name}' - Unexpected Exception: {e}\n{traceback.format_exc()}", exc_info=True)
        return create_error_response(f"Failed to process document '{original_name}' for Qdrant due to an internal error.", 500)

@app.route('/query', methods=['POST'])
def search_qdrant_documents_and_get_kg(): # Renamed for clarity
    current_app.logger.info("--- /query Request (Qdrant Search + KG Retrieval) ---")
    if not request.is_json:
        return create_error_response("Request must be JSON", 400)

    if not vector_service:
        return create_error_response("VectorDBService (Qdrant) is not available.", 503)
    
    # Also check Neo4j driver availability for KG retrieval
    try:
        neo4j_handler.get_driver_instance() # Will raise ConnectionError if not available
    except ConnectionError:
        return create_error_response("Knowledge Graph service (Neo4j) is not available.", 503)


    data = request.get_json()
    query_text = data.get('query')
    user_id_from_request = data.get('user_id') # <<< NEW: Expect user_id
    k = data.get('k', config.QDRANT_DEFAULT_SEARCH_K)
    filter_payload_from_request = data.get('filter') # This is the Qdrant filter
    
    qdrant_filters = None

    if not query_text:
        return create_error_response("Missing 'query' field in request body", 400)
    if not user_id_from_request: # <<< NEW: Validate user_id
        return create_error_response("Missing 'user_id' field in request body", 400)

    # --- Qdrant Filter Setup ---
    # The filter_payload_from_request is for Qdrant. It might contain user_id and original_name.
    # It's important that if a filter is used for Qdrant, it's consistent with the user_id
    # we'll use for KG retrieval. The client (Node.js) should ensure this consistency.
    if filter_payload_from_request and isinstance(filter_payload_from_request, dict):
        from qdrant_client import models as qdrant_models # Import here for safety
        conditions = []
        for key, value in filter_payload_from_request.items():
            conditions.append(qdrant_models.FieldCondition(key=key, match=qdrant_models.MatchValue(value=value)))
        if conditions:
            qdrant_filters = qdrant_models.Filter(must=conditions)
            current_app.logger.info(f"Applying Qdrant filter: {filter_payload_from_request}")
    else:
        current_app.logger.info("No Qdrant filter explicitly provided by client in this query.")


    try:
        k = int(k)
    except ValueError:
        return create_error_response("'k' must be an integer", 400)

    current_app.logger.info(f"Performing Qdrant search for user '{user_id_from_request}', query (first 50): '{query_text[:50]}...' with k={k}")

    try:
        # 1. Perform Qdrant Search
        # `docs` is List[Document], `formatted_context` is str, `docs_map` is Dict
        qdrant_retrieved_docs, formatted_context_snippet, qdrant_docs_map = vector_service.search_documents(
            query=query_text,
            k=k,
            filter_conditions=qdrant_filters # Use the filter passed from client
        )

        # 2. Prepare KG Retrieval based on Qdrant results
        knowledge_graphs_data = {} # To store KGs, mapping documentName to KG object
        
        if qdrant_retrieved_docs:
            unique_doc_names_for_kg = set()
            for doc_obj in qdrant_retrieved_docs:
                # We need 'documentName' or 'original_name' from the Qdrant doc metadata
                # to identify which KG to fetch.
                doc_meta = doc_obj.metadata
                doc_name_for_kg = doc_meta.get('documentName', doc_meta.get('original_name', doc_meta.get('file_name')))
                
                if doc_name_for_kg:
                    unique_doc_names_for_kg.add(doc_name_for_kg)
                else:
                    current_app.logger.warning(f"Qdrant doc metadata missing document identifier (documentName/original_name/file_name) for chunk ID {doc_meta.get('qdrant_id', 'N/A')}. Cannot fetch KG for this chunk's document.")
            
            current_app.logger.info(f"Found {len(unique_doc_names_for_kg)} unique document(s) in Qdrant results to fetch KGs for: {list(unique_doc_names_for_kg)}")

            for doc_name in unique_doc_names_for_kg:
                try:
                    current_app.logger.info(f"Fetching KG for document '{doc_name}' (User: {user_id_from_request})")
                    kg_content = neo4j_handler.get_knowledge_graph(user_id_from_request, doc_name)
                    if kg_content: # get_knowledge_graph returns None if not found
                        knowledge_graphs_data[doc_name] = kg_content
                        current_app.logger.info(f"Successfully retrieved KG for '{doc_name}'. Nodes: {len(kg_content.get('nodes',[]))}, Edges: {len(kg_content.get('edges',[]))}")
                    else:
                        current_app.logger.info(f"No KG found in Neo4j for document '{doc_name}' (User: {user_id_from_request}).")
                        knowledge_graphs_data[doc_name] = {"nodes": [], "edges": [], "message": "KG not found"} # Indicate not found
                except Exception as kg_err:
                    current_app.logger.error(f"Error retrieving KG for document '{doc_name}': {kg_err}", exc_info=True)
                    knowledge_graphs_data[doc_name] = {"nodes": [], "edges": [], "error": f"Failed to retrieve KG: {str(kg_err)}"}


        # 3. Construct Final Response Payload
        response_payload = {
            "query": query_text,
            "k_requested": k,
            "user_id_processed": user_id_from_request, # Echo back user_id
            "qdrant_filter_applied": filter_payload_from_request, # Show Qdrant filter used
            "qdrant_results_count": len(qdrant_retrieved_docs),
            "formatted_context_snippet": formatted_context_snippet,
            "retrieved_documents_map": qdrant_docs_map, # From Qdrant vector_service
            "retrieved_documents_list": [doc.to_dict() for doc in qdrant_retrieved_docs], # From Qdrant vector_service
            "knowledge_graphs": knowledge_graphs_data # <<< NEW: KG data
        }
        
        current_app.logger.info(f"Qdrant search and KG retrieval successful. Returning {len(qdrant_retrieved_docs)} Qdrant docs and KGs for {len(knowledge_graphs_data)} documents.")
        return jsonify(response_payload), 200

    except ConnectionError as ce: # Catch Neo4j or Qdrant connection errors
        current_app.logger.error(f"Service connection error during /query processing: {ce}", exc_info=True)
        return create_error_response(f"A dependent service is unavailable: {str(ce)}", 503)
    except neo4j_exceptions.Neo4jError as ne: # Catch specific Neo4j errors
        current_app.logger.error(f"Neo4j database error during /query processing: {ne}", exc_info=True)
        return create_error_response(f"Neo4j database operation failed: {ne.message}", 500)
    except Exception as e:
        current_app.logger.error(f"/query processing failed: {e}\n{traceback.format_exc()}", exc_info=True)
        return create_error_response(f"Error during query processing: {str(e)}", 500)

# === KG (Neo4j) Endpoints ===

@app.route('/kg', methods=['POST'])
def add_or_update_kg_route():
    current_app.logger.info("--- POST /kg Request (Neo4j Ingestion) ---")
    if not request.is_json:
        return create_error_response("Request must be JSON", 400)

    data = request.get_json()
    user_id = data.get('userId') # Key from Node.js
    original_name = data.get('originalName') # Key from Node.js
    nodes = data.get('nodes')
    edges = data.get('edges')

    if not all([user_id, original_name, isinstance(nodes, list), isinstance(edges, list)]):
        missing_fields = []
        if not user_id: missing_fields.append("userId")
        if not original_name: missing_fields.append("originalName")
        if not isinstance(nodes, list): missing_fields.append("nodes (must be a list)")
        if not isinstance(edges, list): missing_fields.append("edges (must be a list)")
        return create_error_response(f"Missing or invalid fields: {', '.join(missing_fields)}", 400,
                                     details=f"Received: userId type {type(user_id)}, originalName type {type(original_name)}, nodes type {type(nodes)}, edges type {type(edges)}")

    logger.info(f"Attempting to ingest KG for user '{user_id}', document '{original_name}'. Nodes: {len(nodes)}, Edges: {len(edges)}")

    try:
        result = neo4j_handler.ingest_knowledge_graph(user_id, original_name, nodes, edges)
        if result["success"]:
            return jsonify({
                "message": result["message"],
                "userId": user_id,
                "documentName": original_name, # Consistent key name
                "nodes_affected": result["nodes_affected"],
                "edges_affected": result["edges_affected"],
                "status": "completed" # Status field as expected by Node.js
            }), 201
        else: # Should not happen if ingest_knowledge_graph raises on error
            return create_error_response(result.get("message", "KG ingestion failed."), 500)
            
    except ConnectionError as e:
        logger.error(f"Neo4j connection error during KG ingestion for '{original_name}': {e}", exc_info=True)
        return create_error_response(f"Neo4j connection error: {str(e)}. Please check service.", 503)
    except neo4j_exceptions.Neo4jError as e:
        logger.error(f"Neo4jError during KG ingestion for '{original_name}': {e}", exc_info=True)
        return create_error_response(f"Neo4j database error: {e.message}", 500)
    except Exception as e:
        logger.error(f"Unexpected error during KG ingestion for '{original_name}': {e}\n{traceback.format_exc()}", exc_info=True)
        return create_error_response(f"Failed to ingest Knowledge Graph: {str(e)}", 500)


@app.route('/kg/<user_id>/<path:document_name>', methods=['GET']) # Use <path:document_name> to allow slashes
def get_kg_route(user_id, document_name):
    current_app.logger.info(f"--- GET /kg/{user_id}/{document_name} Request (Neo4j Retrieval) ---")

    # Basic sanitization (you might want more robust URL segment sanitization if needed)
    sanitized_user_id = user_id.replace("..","").strip()
    sanitized_document_name = document_name.replace("..","").strip()

    if not sanitized_user_id or not sanitized_document_name:
        return create_error_response("User ID and Document Name URL parameters are required and cannot be empty.", 400)

    logger.info(f"Retrieving KG for user '{sanitized_user_id}', document '{sanitized_document_name}'.")

    try:
        kg_data = neo4j_handler.get_knowledge_graph(sanitized_user_id, sanitized_document_name)

        if kg_data is None: # Handler returns None if not found
            logger.info(f"No KG data found for user '{sanitized_user_id}', document '{sanitized_document_name}'.")
            return create_error_response("Knowledge Graph not found for the specified user and document.", 404)

        logger.info(f"Successfully retrieved KG for document '{sanitized_document_name}'. Nodes: {len(kg_data.get('nodes',[]))}, Edges: {len(kg_data.get('edges',[]))}")
        return jsonify(kg_data), 200

    except ConnectionError as e:
        logger.error(f"Neo4j connection error during KG retrieval: {e}", exc_info=True)
        return create_error_response(f"Neo4j connection error: {str(e)}. Please check service.", 503)
    except neo4j_exceptions.Neo4jError as e:
        logger.error(f"Neo4jError during KG retrieval: {e}", exc_info=True)
        return create_error_response(f"Neo4j database error: {e.message}", 500)
    except Exception as e:
        logger.error(f"Unexpected error during KG retrieval: {e}\n{traceback.format_exc()}", exc_info=True)
        return create_error_response(f"Failed to retrieve Knowledge Graph: {str(e)}", 500)


@app.route('/kg/<user_id>/<path:document_name>', methods=['DELETE']) # Use <path:document_name>
def delete_kg_route(user_id, document_name):
    current_app.logger.info(f"--- DELETE /kg/{user_id}/{document_name} Request (Neo4j Deletion) ---")

    sanitized_user_id = user_id.replace("..","").strip()
    sanitized_document_name = document_name.replace("..","").strip()

    if not sanitized_user_id or not sanitized_document_name:
        return create_error_response("User ID and Document Name URL parameters are required and cannot be empty.", 400)

    logger.info(f"Attempting to delete KG for user '{sanitized_user_id}', document '{sanitized_document_name}'.")

    try:
        deleted = neo4j_handler.delete_knowledge_graph(sanitized_user_id, sanitized_document_name)
        if deleted:
            logger.info(f"Knowledge Graph for document '{sanitized_document_name}' (User: {sanitized_user_id}) deleted successfully.")
            return jsonify({"message": "Knowledge Graph deleted successfully."}), 200
        else:
            logger.info(f"No Knowledge Graph found for document '{sanitized_document_name}' (User: {sanitized_user_id}) to delete.")
            return create_error_response("Knowledge Graph not found for deletion.", 404)

    except ConnectionError as e:
        logger.error(f"Neo4j connection error during KG deletion: {e}", exc_info=True)
        return create_error_response(f"Neo4j connection error: {str(e)}. Please check service.", 503)
    except neo4j_exceptions.Neo4jError as e:
        logger.error(f"Neo4jError during KG deletion: {e}", exc_info=True)
        return create_error_response(f"Neo4j database error: {e.message}", 500)
    except Exception as e:
        logger.error(f"Unexpected error during KG deletion: {e}\n{traceback.format_exc()}", exc_info=True)
        return create_error_response(f"Failed to delete Knowledge Graph: {str(e)}", 500)


if __name__ == '__main__':
    logger.info(f"--- Starting RAG API Service (with KG) on port {config.API_PORT} ---")
    logger.info(f"Qdrant Host: {config.QDRANT_HOST}, Port: {config.QDRANT_PORT}, Collection: {config.QDRANT_COLLECTION_NAME}")
    logger.info(f"Neo4j URI: {config.NEO4J_URI}, User: {config.NEO4J_USERNAME}, DB: {config.NEO4J_DATABASE}")
    logger.info(f"Document Embedding Model (ai_core): {config.DOCUMENT_EMBEDDING_MODEL_NAME} (Dim: {config.DOCUMENT_VECTOR_DIMENSION})")
    logger.info(f"Query Embedding Model (vector_db_service): {config.QUERY_EMBEDDING_MODEL_NAME} (Dim: {config.QUERY_VECTOR_DIMENSION})")
    
    app.run(host='0.0.0.0', port=config.API_PORT, debug=True) # debug=True for development