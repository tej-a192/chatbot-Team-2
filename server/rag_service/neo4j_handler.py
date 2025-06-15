# server/rag_service/neo4j_handler.py

import logging
from neo4j import GraphDatabase, exceptions as neo4j_exceptions
import config

logger = logging.getLogger(__name__)

# --- Neo4j Driver Management ---
_neo4j_driver = None

def init_driver():
    """Initializes the Neo4j driver instance."""
    global _neo4j_driver
    if _neo4j_driver is not None:
        try:
            _neo4j_driver.verify_connectivity()
            logger.info("Neo4j driver already initialized and connected.")
            return
        except Exception:
            logger.warning("Existing Neo4j driver lost connection. Re-initializing.")
            if _neo4j_driver: _neo4j_driver.close()
            _neo4j_driver = None
    try:
        _neo4j_driver = GraphDatabase.driver(
            config.NEO4J_URI,
            auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
        )
        _neo4j_driver.verify_connectivity()
        logger.info(f"Neo4j driver initialized. Connected to: {config.NEO4J_URI}")
    except Exception as e:
        logger.critical(f"Failed to initialize Neo4j driver: {e}", exc_info=True)
        _neo4j_driver = None

def get_driver_instance():
    """Returns the active Neo4j driver instance, initializing if necessary."""
    if _neo4j_driver is None:
        init_driver()
    if _neo4j_driver is None:
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
        driver = get_driver_instance()
        driver.verify_connectivity()
        return True, "connected"
    except Exception as e:
        logger.warning(f"Neo4j connectivity check failed: {str(e)}")
        return False, f"disconnected_or_error: {str(e)}"

def _execute_read_tx(tx_function, *args, **kwargs):
    driver = get_driver_instance()
    with driver.session(database=config.NEO4J_DATABASE) as session:
        return session.execute_read(tx_function, *args, **kwargs)

def _execute_write_tx(tx_function, *args, **kwargs):
    driver = get_driver_instance()
    with driver.session(database=config.NEO4J_DATABASE) as session:
        return session.execute_write(tx_function, *args, **kwargs)

# --- Transactional Cypher Functions ---

def _delete_kg_transactional(tx, user_id, document_name):
    # This function remains unchanged
    query = "MATCH (n:KnowledgeNode {userId: $userId, documentName: $documentName}) DETACH DELETE n"
    result = tx.run(query, userId=user_id, documentName=document_name)
    summary = result.consume()
    return summary.counters.nodes_deleted > 0

def _add_nodes_transactional(tx, nodes_param, user_id, document_name):
    # This function remains unchanged
    processed_nodes = []
    for node_data in nodes_param:
        if isinstance(node_data.get("id"), str) and node_data.get("id").strip():
            processed_nodes.append({
                "id": node_data["id"].strip(),
                "type": node_data.get("type", "concept"),
                "description": node_data.get("description", ""),
                "llm_parent_id": node_data.get("parent")
            })
    if not processed_nodes: return 0
    query = """
    UNWIND $nodes_data as node_props
    MERGE (n:KnowledgeNode {nodeId: node_props.id, userId: $userId, documentName: $documentName})
    SET n.type = node_props.type, n.description = node_props.description, n.llm_parent_id = node_props.llm_parent_id, n.userId = $userId, n.documentName = $documentName
    RETURN count(n) as nodes_affected
    """
    result = tx.run(query, nodes_data=processed_nodes, userId=user_id, documentName=document_name)
    return result.single()[0] if result.peek() else 0

def _add_edges_transactional(tx, edges_param, user_id, document_name):
    # This function remains unchanged
    valid_edges = [
        {"from": e["from"].strip(), "to": e["to"].strip(), "relationship": e["relationship"].strip().upper().replace(" ", "_")}
        for e in edges_param if isinstance(e.get("from"), str) and e.get("from").strip() and isinstance(e.get("to"), str) and e.get("to").strip() and isinstance(e.get("relationship"), str) and e.get("relationship").strip()
    ]
    if not valid_edges: return 0
    query = """
    UNWIND $edges_data as edge_props
    MATCH (startNode:KnowledgeNode {nodeId: edge_props.from, userId: $userId, documentName: $documentName})
    MATCH (endNode:KnowledgeNode {nodeId: edge_props.to, userId: $userId, documentName: $documentName})
    MERGE (startNode)-[r:RELATED_TO {type: edge_props.relationship}]->(endNode)
    RETURN count(r) as edges_affected
    """
    result = tx.run(query, edges_data=valid_edges, userId=user_id, documentName=document_name)
    return result.single()[0] if result.peek() else 0

def _get_kg_transactional(tx, user_id, document_name):
    # This function remains unchanged
    nodes_query = "MATCH (n:KnowledgeNode {userId: $userId, documentName: $documentName}) RETURN n.nodeId AS id, n.type AS type, n.description AS description, n.llm_parent_id AS parent"
    nodes_result = tx.run(nodes_query, userId=user_id, documentName=document_name)
    nodes_data = [dict(record) for record in nodes_result]
    edges_query = "MATCH (startNode:KnowledgeNode {userId: $userId, documentName: $documentName})-[r:RELATED_TO]->(endNode:KnowledgeNode {userId: $userId, documentName: $documentName}) RETURN startNode.nodeId AS from, endNode.nodeId AS to, r.type AS relationship"
    edges_result = tx.run(edges_query, userId=user_id, documentName=document_name)
    edges_data = [dict(record) for record in edges_result]
    return {"nodes": nodes_data, "edges": edges_data}

# --- NEW TRANSACTIONAL FUNCTION FOR KG SEARCH ---
def _search_kg_transactional(tx, user_id, document_name, query_text):
    logger.info(f"Neo4j TX: Searching KG for user '{user_id}', doc '{document_name}' with query: '{query_text[:50]}...'")
    
    # NOTE: You must create a full-text index in Neo4j for this to work efficiently.
    # Run this command in your Neo4j Browser:
    # CREATE FULLTEXT INDEX node_search_index FOR (n:KnowledgeNode) ON EACH [n.nodeId, n.description]
    query = """
    CALL db.index.fulltext.queryNodes("node_search_index", $query_text) YIELD node, score
    WHERE node.userId = $userId AND node.documentName = $documentName
    WITH node, score
    ORDER BY score DESC
    LIMIT 5
    OPTIONAL MATCH (node)-[r:RELATED_TO]-(neighbor)
    RETURN node.nodeId AS nodeId, node.description AS description, 
           COLLECT(DISTINCT {
               relationship: r.type, 
               neighborId: neighbor.nodeId
           }) AS relations
    """
    
    results = tx.run(query, userId=user_id, documentName=document_name, query_text=query_text)
    
    facts = []
    for record in results:
        node_id = record["nodeId"]
        description = record["description"]
        relations = record["relations"]
        
        fact = f"- Concept '{node_id}': {description}"
        if relations and relations[0] is not None:
            related_facts = [f"is '{rel['relationship']}' '{rel['neighborId']}'" for rel in relations if rel.get('relationship') and rel.get('neighborId')]
            if related_facts:
                fact += f" | It {', '.join(related_facts)}."
        facts.append(fact)
        
    if not facts:
        logger.info(f"Neo4j TX: No relevant KG facts found for query.")
        return "No specific facts were found in the knowledge graph for this query."
        
    logger.info(f"Neo4j TX: Extracted {len(facts)} facts from KG.")
    return "Facts from Knowledge Graph:\n" + "\n".join(facts)

# --- Public Service Functions ---

def ingest_knowledge_graph(user_id: str, document_name: str, nodes: list, edges: list) -> dict:
    # This function remains unchanged
    try:
        _execute_write_tx(_delete_kg_transactional, user_id, document_name)
        nodes_affected = _execute_write_tx(_add_nodes_transactional, nodes, user_id, document_name) if nodes else 0
        edges_affected = _execute_write_tx(_add_edges_transactional, edges, user_id, document_name) if edges else 0
        return {"success": True, "message": "KG ingested.", "nodes_affected": nodes_affected, "edges_affected": edges_affected}
    except Exception as e:
        logger.error(f"Error during KG ingestion for doc '{document_name}': {e}", exc_info=True)
        raise

def get_knowledge_graph(user_id: str, document_name: str) -> dict:
    # This function remains unchanged
    try:
        return _execute_read_tx(_get_kg_transactional, user_id, document_name) or {"nodes": [], "edges": []}
    except Exception as e:
        logger.error(f"Error retrieving KG for doc '{document_name}': {e}", exc_info=True)
        raise

def delete_knowledge_graph(user_id: str, document_name: str) -> bool:
    # This function remains unchanged
    try:
        return _execute_write_tx(_delete_kg_transactional, user_id, document_name)
    except Exception as e:
        logger.error(f"Error deleting KG for doc '{document_name}': {e}", exc_info=True)
        raise

# --- NEW PUBLIC FUNCTION FOR KG SEARCH ---
def search_knowledge_graph(user_id: str, document_name: str, query_text: str) -> str:
    """
    Searches the knowledge graph and returns a summarized string of facts.
    """
    try:
        return _execute_read_tx(_search_kg_transactional, user_id, document_name, query_text)
    except Exception as e:
        logger.error(f"Error searching KG for doc '{document_name}', user '{user_id}': {e}", exc_info=True)
        # It's better to return an error message than crash the agent
        return f"An error occurred while searching the knowledge graph: {e}"