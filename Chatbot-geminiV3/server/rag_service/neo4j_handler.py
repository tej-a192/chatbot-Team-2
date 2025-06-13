# server/rag_service/neo4j_handler.py

import logging
from neo4j import GraphDatabase, exceptions as neo4j_exceptions
import config # Assumes config.py is in the same directory or python path is set correctly

logger = logging.getLogger(__name__)

# --- Neo4j Driver Management ---
_neo4j_driver = None

def init_driver():
    """Initializes the Neo4j driver instance."""
    global _neo4j_driver
    if _neo4j_driver is not None:
        try: # Check if existing driver is still connected
            _neo4j_driver.verify_connectivity()
            logger.info("Neo4j driver already initialized and connected.")
            return
        except Exception:
            logger.warning("Existing Neo4j driver lost connection or failed verification. Re-initializing.")
            if _neo4j_driver:
                _neo4j_driver.close()
            _neo4j_driver = None # Force re-initialization

    try:
        _neo4j_driver = GraphDatabase.driver(
            config.NEO4J_URI,
            auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
        )
        _neo4j_driver.verify_connectivity()
        logger.info(f"Neo4j driver initialized. Connected to: {config.NEO4J_URI} (DB: {config.NEO4J_DATABASE})")
    except neo4j_exceptions.ServiceUnavailable:
        logger.critical(f"Failed to connect to Neo4j at {config.NEO4J_URI}. Ensure Neo4j is running and accessible.")
        _neo4j_driver = None
    except neo4j_exceptions.AuthError:
        logger.critical(f"Neo4j authentication failed for user '{config.NEO4J_USERNAME}'. Check credentials.")
        _neo4j_driver = None
    except Exception as e:
        logger.critical(f"An unexpected error occurred while initializing Neo4j driver: {e}", exc_info=True)
        _neo4j_driver = None

def get_driver_instance():
    """Returns the active Neo4j driver instance, initializing if necessary."""
    if _neo4j_driver is None:
        init_driver()
    if _neo4j_driver is None: # Check again after trying to init
        raise ConnectionError("Neo4j driver is not available. Initialization failed.")
    return _neo4j_driver

def close_driver():
    """Closes the Neo4j driver instance if it exists."""
    global _neo4j_driver
    if _neo4j_driver:
        _neo4j_driver.close()
        _neo4j_driver = None
        logger.info("Neo4j driver closed.")

def check_neo4j_connectivity():
    """Checks if the Neo4j driver can connect."""
    try:
        driver = get_driver_instance() # This will try to init if not already
        driver.verify_connectivity()
        return True, "connected"
    except Exception as e:
        logger.warning(f"Neo4j connectivity check failed: {str(e)}")
        return False, f"disconnected_or_error: {str(e)}"

# --- Private Transaction Helper Functions ---
def _execute_read_tx(tx_function, *args, **kwargs):
    driver = get_driver_instance()
    with driver.session(database=config.NEO4J_DATABASE) as session:
        return session.execute_read(tx_function, *args, **kwargs)

def _execute_write_tx(tx_function, *args, **kwargs):
    driver = get_driver_instance()
    with driver.session(database=config.NEO4J_DATABASE) as session:
        return session.execute_write(tx_function, *args, **kwargs)

# --- Private Transactional Cypher Functions ---
def _delete_kg_transactional(tx, user_id, document_name):
    logger.info(f"Neo4j TX: Deleting KG for user '{user_id}', document '{document_name}'")
    query = (
        "MATCH (n:KnowledgeNode {userId: $userId, documentName: $documentName}) "
        "DETACH DELETE n"
    )
    result = tx.run(query, userId=user_id, documentName=document_name)
    summary = result.consume()
    deleted_count = summary.counters.nodes_deleted + summary.counters.relationships_deleted
    logger.info(f"Neo4j TX: Deleted {summary.counters.nodes_deleted} nodes and {summary.counters.relationships_deleted} relationships for '{document_name}'.")
    return deleted_count > 0

def _add_nodes_transactional(tx, nodes_param, user_id, document_name):
    logger.info(f"Neo4j TX: Adding/merging {len(nodes_param)} nodes for user '{user_id}', document '{document_name}'")
    # Ensure nodes have a type, default to "concept" if not provided
    # And llm_parent_id for parent from LLM's perspective
    processed_nodes = []
    for node_data in nodes_param:
        # Ensure ID is a string and not empty
        if not isinstance(node_data.get("id"), str) or not node_data.get("id").strip():
            logger.warning(f"Skipping node with invalid or missing ID: {node_data}")
            continue
        
        processed_node = {
            "id": node_data["id"].strip(), # Use the LLM's 'id' as 'nodeId'
            "type": node_data.get("type", "concept"), # Default type
            "description": node_data.get("description", ""),
            "llm_parent_id": node_data.get("parent", None) # Store the 'parent' from LLM
        }
        processed_nodes.append(processed_node)

    if not processed_nodes:
        logger.warning("No valid nodes to process after filtering.")
        return 0

    query = (
        "UNWIND $nodes_data as node_props "
        "MERGE (n:KnowledgeNode {nodeId: node_props.id, userId: $userId, documentName: $documentName}) "
        "ON CREATE SET n.type = node_props.type, "
        "              n.description = node_props.description, "
        "              n.llm_parent_id = node_props.llm_parent_id, "
        "              n.userId = $userId, " # Ensure userId is set on create
        "              n.documentName = $documentName " # Ensure documentName is set on create
        "ON MATCH SET n.type = node_props.type, " # Update existing nodes too
        "             n.description = node_props.description, "
        "             n.llm_parent_id = node_props.llm_parent_id "
        "RETURN count(n) as nodes_affected"
    )
    result = tx.run(query, nodes_data=processed_nodes, userId=user_id, documentName=document_name)
    count = result.single()[0] if result.peek() else 0
    logger.info(f"Neo4j TX: Affected (created or merged) {count} nodes for '{document_name}'.")
    return count

def _add_edges_transactional(tx, edges_param, user_id, document_name):
    logger.info(f"Neo4j TX: Adding/merging {len(edges_param)} edges for user '{user_id}', document '{document_name}'")
    if not edges_param:
        logger.info("Neo4j TX: No edges provided to add.")
        return 0
        
    # Filter out invalid edges
    valid_edges = []
    for edge_data in edges_param:
        if not (isinstance(edge_data.get("from"), str) and edge_data.get("from").strip() and
                isinstance(edge_data.get("to"), str) and edge_data.get("to").strip() and
                isinstance(edge_data.get("relationship"), str) and edge_data.get("relationship").strip()):
            logger.warning(f"Skipping invalid edge data: {edge_data}")
            continue
        valid_edges.append({
            "from": edge_data["from"].strip(),
            "to": edge_data["to"].strip(),
            "relationship": edge_data["relationship"].strip().upper().replace(" ", "_") # Sanitize relationship type
        })

    if not valid_edges:
        logger.warning("No valid edges to process after filtering.")
        return 0

    # Cypher query to create relationships. Note: relationship type is dynamic using brackets.
    # We use MERGE to avoid duplicate relationships with the same type between the same nodes.
    # Relationship properties are set using SET.
    query = (
        "UNWIND $edges_data as edge_props "
        "MATCH (startNode:KnowledgeNode {nodeId: edge_props.from, userId: $userId, documentName: $documentName}) "
        "MATCH (endNode:KnowledgeNode {nodeId: edge_props.to, userId: $userId, documentName: $documentName}) "
        "CALL apoc.merge.relationship(startNode, edge_props.relationship, {}, {type: edge_props.relationship}, endNode) YIELD rel "
        # MERGE (startNode)-[r:HAS_RELATIONSHIP]->(endNode) " # Simpler, but cannot set type dynamically easily.
        # "SET r.type = edge_props.relationship "
        "RETURN count(rel) as edges_affected"
    )
    # Note: The above MERGE using apoc.merge.relationship is more robust for dynamic relationship types.
    # If APOC is not available, a simpler MERGE (startNode)-[r:REL {type:edge_props.relationship}]->(endNode) would work.
    # Or create relationships with a generic type like :RELATED_TO and store the specific type as a property.
    # For this example, assuming APOC for dynamic relationship types. If not, adjust the query.
    # Simpler, if APOC is not available (relationship type becomes a property of a generic :RELATED_TO relationship):
    simple_query = (
        "UNWIND $edges_data as edge_props "
        "MATCH (startNode:KnowledgeNode {nodeId: edge_props.from, userId: $userId, documentName: $documentName}) "
        "MATCH (endNode:KnowledgeNode {nodeId: edge_props.to, userId: $userId, documentName: $documentName}) "
        "MERGE (startNode)-[r:RELATED_TO {type: edge_props.relationship}]->(endNode) "
        "RETURN count(r) as edges_affected"
    )
    # Let's use the simpler query for broader compatibility without APOC.
    
    result = tx.run(simple_query, edges_data=valid_edges, userId=user_id, documentName=document_name)
    count = result.single()[0] if result.peek() else 0
    logger.info(f"Neo4j TX: Affected (created or merged) {count} relationships for '{document_name}'.")
    return count

def _get_kg_transactional(tx, user_id, document_name):
    logger.info(f"Neo4j TX: Retrieving KG for user '{user_id}', document '{document_name}'")
    nodes_query = (
        "MATCH (n:KnowledgeNode {userId: $userId, documentName: $documentName}) "
        "RETURN n.nodeId AS id, n.type AS type, n.description AS description, n.llm_parent_id AS parent"
    )
    nodes_result = tx.run(nodes_query, userId=user_id, documentName=document_name)
    # Convert Neo4j records to dictionaries
    nodes_data = [dict(record) for record in nodes_result]

    edges_query = (
        "MATCH (startNode:KnowledgeNode {userId: $userId, documentName: $documentName})"
        "-[r:RELATED_TO]->" # Using the generic relationship type from the simple_query
        "(endNode:KnowledgeNode {userId: $userId, documentName: $documentName}) "
        "RETURN startNode.nodeId AS from, endNode.nodeId AS to, r.type AS relationship"
    )
    edges_result = tx.run(edges_query, userId=user_id, documentName=document_name)
    edges_data = [dict(record) for record in edges_result]

    logger.info(f"Neo4j TX: Retrieved {len(nodes_data)} nodes and {len(edges_data)} edges for '{document_name}'.")
    return {"nodes": nodes_data, "edges": edges_data}


# --- Public Service Functions ---
def ingest_knowledge_graph(user_id: str, document_name: str, nodes: list, edges: list) -> dict:
    """
    Deletes existing KG for the document and ingests new nodes and edges.
    Returns a summary of operations.
    """
    try:
        logger.info(f"Attempting to delete old KG (if any) for document '{document_name}' (User: {user_id}).")
        _execute_write_tx(_delete_kg_transactional, user_id, document_name)
        logger.info(f"Old KG (if any) deleted for '{document_name}'. Proceeding with ingestion.")

        nodes_affected = 0
        if nodes and len(nodes) > 0:
            nodes_affected = _execute_write_tx(_add_nodes_transactional, nodes, user_id, document_name)
        
        edges_affected = 0
        if edges and len(edges) > 0:
            edges_affected = _execute_write_tx(_add_edges_transactional, edges, user_id, document_name)

        message = "Knowledge Graph successfully ingested/updated."
        logger.info(f"{message} Doc: '{document_name}', User: '{user_id}'. Nodes: {nodes_affected}, Edges: {edges_affected}")
        return {
            "success": True,
            "message": message,
            "nodes_affected": nodes_affected,
            "edges_affected": edges_affected
        }
    except Exception as e:
        logger.error(f"Error during KG ingestion for document '{document_name}', user '{user_id}': {e}", exc_info=True)
        raise # Re-raise to be caught by the route handler

def get_knowledge_graph(user_id: str, document_name: str) -> dict:
    """
    Retrieves the knowledge graph for a given user and document name.
    """
    try:
        kg_data = _execute_read_tx(_get_kg_transactional, user_id, document_name)
        if not kg_data["nodes"] and not kg_data["edges"]:
            logger.info(f"No KG data found for user '{user_id}', document '{document_name}'.")
            return None # Indicate not found
        return kg_data
    except Exception as e:
        logger.error(f"Error retrieving KG for document '{document_name}', user '{user_id}': {e}", exc_info=True)
        raise

def delete_knowledge_graph(user_id: str, document_name: str) -> bool:
    """
    Deletes the knowledge graph for a given user and document name.
    Returns True if data was deleted, False otherwise.
    """
    try:
        was_deleted = _execute_write_tx(_delete_kg_transactional, user_id, document_name)
        return was_deleted
    except Exception as e:
        logger.error(f"Error deleting KG for document '{document_name}', user '{user_id}': {e}", exc_info=True)
        raise