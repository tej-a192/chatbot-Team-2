# server/neo4j_service.py
import logging
from neo4j import GraphDatabase, basic_auth, exceptions as neo4j_driver_exceptions # Use a distinct alias

logger = logging.getLogger(__name__) # Logger for this service module

class Neo4jService:
    def __init__(self, uri, user, password):
        self.uri = uri
        self.user = user
        self.password = password
        self._driver = None
        self._connect() # Attempt connection on initialization

    def _connect(self):
        if self._driver: # If driver exists, verify before assuming it's good
            try:
                self._driver.verify_connectivity()
                logger.debug("Neo4j connection already active and verified.")
                return # Driver is good, no need to reconnect
            except Exception as e:
                logger.warning(f"Existing Neo4j driver failed verification ({e}), attempting to close and reconnect.")
                self.close() # Close faulty driver

        try:
            logger.info(f"Attempting to establish new Neo4j connection to {self.uri}")
            self._driver = GraphDatabase.driver(self.uri, auth=basic_auth(self.user, self.password))
            self._driver.verify_connectivity() # Crucial check
            logger.info("Successfully connected to Neo4j and verified connectivity.")
            self._ensure_indexes()
        except neo4j_driver_exceptions.ServiceUnavailable as e:
            logger.error(f"Neo4j ServiceUnavailable at {self.uri}: {e}. Ensure Neo4j is running.")
            self._driver = None
            raise ConnectionError(f"Neo4j ServiceUnavailable: {e}")
        except neo4j_driver_exceptions.AuthError as e:
            logger.error(f"Neo4j authentication failed for user '{self.user}': {e}. Check credentials.")
            self._driver = None
            raise ConnectionError(f"Neo4j authentication failed: {e}")
        except Exception as e:
            logger.error(f"Unexpected error during Neo4j connection: {e}", exc_info=True)
            self._driver = None
            raise ConnectionError(f"Unexpected error connecting to Neo4j: {e}")

    def close(self):
        if self._driver is not None:
            logger.info("Closing Neo4j driver connection.")
            self._driver.close()
            self._driver = None

    def get_driver(self):
        """Ensures the driver is active, attempting to reconnect if necessary."""
        if self._driver is None or not self.check_connectivity():
            logger.warning("Neo4j driver is None or inactive. Attempting to (re)connect.")
            self._connect() # This will raise ConnectionError if it fails
        
        # After _connect, self._driver should be set if successful
        if self._driver is None: 
            # This path implies _connect() failed to establish a driver.
            raise ConnectionError("Neo4j driver could not be established or re-established.")
        return self._driver
        
    def _ensure_indexes(self):
        if not self._driver:
            logger.warning("Cannot ensure indexes: Neo4j driver not available (should have been caught by _connect).")
            return
        
        indexes_to_create = [
            "CREATE INDEX idx_user_userId IF NOT EXISTS FOR (u:User) ON (u.userId);",
            "CREATE INDEX idx_document_name_userId IF NOT EXISTS FOR (d:Document) ON (d.name, d.userId);",
            "CREATE INDEX idx_kgnode_scoped_id IF NOT EXISTS FOR (kn:KnowledgeNode) ON (kn.id, kn.documentName, kn.userId);"
        ]
        try:
            # Use the existing driver instance for creating indexes
            with self._driver.session(database="neo4j") as session:
                for index_query in indexes_to_create:
                    logger.info(f"Ensuring index: {index_query}")
                    session.run(index_query)
                logger.info("Neo4j indexes ensured successfully.")
        except Exception as e:
            logger.error(f"Failed to ensure Neo4j indexes (non-critical for service start): {e}", exc_info=True)

    @staticmethod
    def _create_kg_tx(tx, user_id, original_name, nodes_data, edges_data):
        tx.run("MERGE (u:User {userId: $userId})", userId=user_id)
        tx.run("""
            MATCH (u:User {userId: $userId})
            MERGE (d:Document {name: $original_name, userId: $userId})
            MERGE (u)-[:OWNS_DOCUMENT]->(d)
        """, userId=user_id, original_name=original_name)

        for node_info in nodes_data:
            props_to_set = {k: v for k, v in node_info.items() if k not in ['id', 'parent'] and v is not None}
            props_to_set["json_parent_id"] = node_info.get("parent") # Explicitly handle parent
            
            tx.run("""
                MATCH (doc:Document {name: $original_name, userId: $userId})
                MERGE (kn:KnowledgeNode {
                    id: $node_id, documentName: $original_name, userId: $userId
                })
                ON CREATE SET kn = $props_to_set, kn.id = $node_id, kn.documentName = $original_name, kn.userId = $userId
                ON MATCH SET kn += $props_to_set 
                MERGE (doc)-[:CONTAINS_KG_ELEMENT]->(kn)
            """, original_name=original_name, userId=user_id, node_id=node_info['id'], props_to_set=props_to_set)

        for edge_info in edges_data:
            rel_type_sanitized = "".join(c if c.isalnum() else '_' for c in str(edge_info['relationship']).upper())
            if not rel_type_sanitized: rel_type_sanitized = "RELATED_TO"
            query = f"""
                MATCH (from_node:KnowledgeNode {{id: $from_id, documentName: $original_name, userId: $userId}})
                MATCH (to_node:KnowledgeNode {{id: $to_id, documentName: $original_name, userId: $userId}})
                MERGE (from_node)-[r:{rel_type_sanitized}]->(to_node)
            """
            tx.run(query, from_id=edge_info['from'], to_id=edge_info['to'], original_name=original_name, userId=user_id)
        logger.debug(f"KG TX for doc '{original_name}' user '{user_id}' committed.")
        return {"status": "success", "message": "Knowledge graph elements processed.", "user_id": user_id, "document_name": original_name}

    @staticmethod
    def _get_kg_tx(tx, user_id, original_name):
        result = tx.run("""
            MATCH (usr:User {userId: $userId})-[:OWNS_DOCUMENT]->(doc:Document {name: $original_name, userId: $userId})
            OPTIONAL MATCH (doc)-[:CONTAINS_KG_ELEMENT]->(kn:KnowledgeNode)
            WITH usr, doc, COLLECT(DISTINCT kn) AS all_kg_nodes
            WITH usr, doc, [node IN all_kg_nodes WHERE node IS NOT NULL] AS kg_nodes_list
            UNWIND (CASE WHEN size(kg_nodes_list) > 0 THEN kg_nodes_list ELSE [null] END) AS n
            OPTIONAL MATCH (n)-[r]->(m:KnowledgeNode) WHERE m IN kg_nodes_list
            RETURN
                usr.userId AS user_id,
                doc.name AS original_name,
                [node_obj IN kg_nodes_list | {
                    id: node_obj.id, type: node_obj.type,
                    parent: node_obj.json_parent_id, description: node_obj.description
                }] AS nodes,
                COLLECT(DISTINCT CASE WHEN r IS NOT NULL AND n IS NOT NULL AND m IS NOT NULL THEN {
                    from: startNode(r).id, to: endNode(r).id, relationship: type(r)
                } ELSE null END) AS edges_with_nulls
        """, userId=user_id, original_name=original_name)
        
        record = result.single()
        if record and record["user_id"]:
            valid_edges = [edge for edge in record["edges_with_nulls"] if edge] if record["edges_with_nulls"] else []
            return {
                "user_id": record["user_id"], "original_name": record["original_name"],
                "nodes": record["nodes"] if record["nodes"] else [], "edges": valid_edges
            }
        return None

    @staticmethod
    def _delete_kg_tx(tx, user_id, original_name):
        doc_check_result = tx.run("""
            MATCH (u:User {userId: $userId})-[:OWNS_DOCUMENT]->(d:Document {name: $original_name, userId: $userId})
            RETURN d
        """, userId=user_id, original_name=original_name)
        
        if not doc_check_result.single(): # Or check .peek() is not None
            return {"status": "not_found", "message": f"Document '{original_name}' for user '{user_id}' not found."}

        # If document exists, proceed with deletion
        result = tx.run("""
            MATCH (doc:Document {name: $original_name, userId: $userId}) 
            OPTIONAL MATCH (doc)-[:CONTAINS_KG_ELEMENT]->(kn:KnowledgeNode)
            WITH doc, COLLECT(kn) as kg_nodes_to_delete, count(kn) as kg_nodes_count
            DETACH DELETE doc // Delete the document node
            WITH kg_nodes_to_delete, kg_nodes_count // Pass collected KGs and count
            UNWIND (CASE WHEN size(kg_nodes_to_delete) > 0 AND kg_nodes_to_delete[0] IS NOT NULL THEN kg_nodes_to_delete ELSE [] END) AS node_to_delete
            DETACH DELETE node_to_delete // Delete the knowledge nodes
            RETURN kg_nodes_count, 1 as doc_deleted_count 
        """, userId=user_id, original_name=original_name).single() # Expects a single summary record

        # If result is None (e.g. document was deleted by another transaction between check and this query part),
        # this would error. However, tx ensures atomicity. If MATCH (doc) fails, result will have 0 for counts.
        # But our initial check should prevent this state ideally.
        if not result: # Should not happen due to initial check and transaction
             logger.error(f"Unexpected: Deletion query for doc '{original_name}' user '{user_id}' returned no result after doc was confirmed to exist.")
             return {"status": "error", "message": "Unexpected error during deletion."}

        return {
            "status": "deleted", "user_id": user_id, "document_name": original_name,
            "documents_deleted": result["doc_deleted_count"], # Should be 1
            "kg_nodes_deleted": result["kg_nodes_count"]
        }

    def add_knowledge_graph(self, user_id, original_name, nodes_data, edges_data):
        driver = self.get_driver()
        with driver.session(database="neo4j") as session:
            return session.execute_write(self._create_kg_tx, user_id, original_name, nodes_data, edges_data)

    def get_knowledge_graph(self, user_id, original_name):
        driver = self.get_driver()
        with driver.session(database="neo4j") as session:
            return session.execute_read(self._get_kg_tx, user_id, original_name)

    def delete_knowledge_graph(self, user_id, original_name):
        driver = self.get_driver()
        with driver.session(database="neo4j") as session:
            return session.execute_write(self._delete_kg_tx, user_id, original_name)
            
    def check_connectivity(self):
        if not self._driver: return False
        try:
            self._driver.verify_connectivity()
            return True
        except Exception: # Any exception during verification means not connected
            return False