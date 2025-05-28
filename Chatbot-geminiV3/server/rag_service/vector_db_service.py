# server/vector_db_service.py

import uuid
import logging
from typing import List, Dict, Tuple, Optional, Any

from qdrant_client import QdrantClient, models
from sentence_transformers import SentenceTransformer

import config

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class Document:
    def __init__(self, page_content: str, metadata: dict):
        self.page_content = page_content
        self.metadata = metadata

    def to_dict(self):
        return {"page_content": self.page_content, "metadata": self.metadata}

class VectorDBService:
    def __init__(self):
        logger.info("Initializing VectorDBService...")
        logger.info(f"  Qdrant Host: {config.QDRANT_HOST}, Port: {config.QDRANT_PORT}, URL: {config.QDRANT_URL}")
        logger.info(f"  Collection: {config.QDRANT_COLLECTION_NAME}")
        logger.info(f"  Query Embedding Model: {config.QUERY_EMBEDDING_MODEL_NAME}")
        
        self.vector_dim = config.QDRANT_COLLECTION_VECTOR_DIM
        logger.info(f"  Service expects Vector Dim for Qdrant collection: {self.vector_dim} (from document model config)")

        if config.QDRANT_URL:
            self.client = QdrantClient(
                url=config.QDRANT_URL,
                api_key=config.QDRANT_API_KEY,
                timeout=30
            )
        else:
            self.client = QdrantClient(
                host=config.QDRANT_HOST,
                port=config.QDRANT_PORT,
                api_key=config.QDRANT_API_KEY,
                timeout=30
            )

        try:
            logger.info(f"  Loading query embedding model: '{config.QUERY_EMBEDDING_MODEL_NAME}'")
            self.model = SentenceTransformer(config.QUERY_EMBEDDING_MODEL_NAME)
            model_embedding_dim = self.model.get_sentence_embedding_dimension()
            logger.info(f"  Query model loaded. Output dimension: {model_embedding_dim}")

            if model_embedding_dim != self.vector_dim:
                error_msg = (
                    f"CRITICAL DIMENSION MISMATCH: Query model '{config.QUERY_EMBEDDING_MODEL_NAME}' "
                    f"outputs embeddings of dimension {model_embedding_dim}, but the Qdrant collection "
                    f"is configured for dimension {self.vector_dim} (derived from document model: "
                    f"'{config.DOCUMENT_EMBEDDING_MODEL_NAME}'). Search functionality will fail. "
                    "Ensure query and document models produce compatible embedding dimensions, "
                    "or environment variables for dimensions are correctly set."
                )
                logger.error(error_msg)
                raise ValueError(error_msg)
            else:
                logger.info(f"  Query model output dimension ({model_embedding_dim}) matches "
                            f"Qdrant collection dimension ({self.vector_dim}).")

        except Exception as e:
            logger.error(f"Error initializing SentenceTransformer model '{config.QUERY_EMBEDDING_MODEL_NAME}' for query encoding: {e}", exc_info=True)
            raise

        self.collection_name = config.QDRANT_COLLECTION_NAME

    def _recreate_qdrant_collection(self):
        logger.info(f"Attempting to (re)create collection '{self.collection_name}' with vector size {self.vector_dim}.")
        try:
            self.client.recreate_collection(
                collection_name=self.collection_name,
                vectors_config=models.VectorParams(
                    size=self.vector_dim,
                    distance=models.Distance.COSINE,
                ),
            )
            logger.info(f"Collection '{self.collection_name}' (re)created successfully.")
        except Exception as e_recreate:
            logger.error(f"Failed to (re)create collection '{self.collection_name}': {e_recreate}", exc_info=True)
            raise

    def setup_collection(self):
        try:
            collection_info = self.client.get_collection(collection_name=self.collection_name)
            logger.info(f"Collection '{self.collection_name}' already exists.")
            
            current_vectors_config = None
            if hasattr(collection_info.config.params, 'vectors'):
                if isinstance(collection_info.config.params.vectors, models.VectorParams):
                     current_vectors_config = collection_info.config.params.vectors
                elif isinstance(collection_info.config.params.vectors, dict): # For named vectors
                    default_vector_name = '' # Qdrant client uses empty string for default unnamed vector
                    if default_vector_name in collection_info.config.params.vectors:
                        current_vectors_config = collection_info.config.params.vectors[default_vector_name]
                    elif collection_info.config.params.vectors: # Fallback if default not found, get first one
                        current_vectors_config = next(iter(collection_info.config.params.vectors.values()))

            if not current_vectors_config:
                 logger.error(f"Could not determine vector configuration for existing collection '{self.collection_name}'. Recreating.")
                 self._recreate_qdrant_collection()
            elif current_vectors_config.size != self.vector_dim:
                logger.warning(f"Collection '{self.collection_name}' vector size {current_vectors_config.size} "
                               f"differs from service's expected {self.vector_dim}. Recreating.")
                self._recreate_qdrant_collection()
            elif current_vectors_config.distance != models.Distance.COSINE:
                logger.warning(f"Collection '{self.collection_name}' distance {current_vectors_config.distance} "
                               f"differs from expected {models.Distance.COSINE}. Recreating.")
                self._recreate_qdrant_collection()
            else:
                logger.info(f"Collection '{self.collection_name}' configuration is compatible (Size: {current_vectors_config.size}, Distance: {current_vectors_config.distance}).")

        except Exception as e:
            if "not found" in str(e).lower() or \
               (hasattr(e, 'status_code') and e.status_code == 404) or \
               " ভাগ্যবান" in str(e).lower():
                 logger.info(f"Collection '{self.collection_name}' not found. Attempting to create...")
            else:
                 logger.warning(f"Error checking collection '{self.collection_name}': {type(e).__name__} - {e}. Attempting to (re)create anyway...")
            self._recreate_qdrant_collection()

    def add_processed_chunks(self, processed_chunks: List[Dict[str, Any]]) -> int:
        if not processed_chunks:
            logger.warning("add_processed_chunks received an empty list. No points to upsert.")
            return 0

        points_to_upsert = []
        # Try to get a representative document name for logging from the first chunk's metadata
        # This assumes ai_core provides 'file_name' or 'original_name' in metadata
        doc_name_for_logging = "Unknown Document"
        if processed_chunks and 'metadata' in processed_chunks[0]:
            first_chunk_meta = processed_chunks[0]['metadata']
            doc_name_for_logging = first_chunk_meta.get('file_name', first_chunk_meta.get('original_name', "Unknown Document"))

        for chunk_data in processed_chunks:
            point_id = chunk_data.get('id', str(uuid.uuid4()))
            vector = chunk_data.get('embedding')
            
            # The payload is primarily the metadata from ai_core
            payload = chunk_data.get('metadata', {}).copy()
            # Add the actual text content of the chunk to the payload
            payload['chunk_text_content'] = chunk_data.get('text_content', '')

            # Validation for vector
            if not vector:
                logger.warning(f"Chunk with ID '{point_id}' from '{doc_name_for_logging}' is missing 'embedding'. Skipping.")
                continue
            if not isinstance(vector, list) or not all(isinstance(x, (float, int)) for x in vector):
                logger.warning(f"Chunk with ID '{point_id}' from '{doc_name_for_logging}' has an invalid 'embedding' format. Skipping.")
                continue
            if len(vector) != self.vector_dim:
                logger.error(f"Chunk with ID '{point_id}' from '{doc_name_for_logging}' has embedding dimension {len(vector)}, "
                             f"but collection expects {self.vector_dim}. Skipping. "
                             f"Ensure ai_core's document embedding model ('{config.DOCUMENT_EMBEDDING_MODEL_NAME}') "
                             f"output dimension matches configuration.")
                continue

            points_to_upsert.append(models.PointStruct(
                id=point_id,
                vector=[float(v) for v in vector], # Ensure all are floats for Qdrant
                payload=payload
            ))

        if not points_to_upsert:
            logger.warning(f"No valid points constructed from processed_chunks for document: {doc_name_for_logging}.")
            return 0

        try:
            self.client.upsert(collection_name=self.collection_name, points=points_to_upsert, wait=True)
            logger.info(f"Successfully upserted {len(points_to_upsert)} chunks for document: {doc_name_for_logging} into Qdrant.")
            return len(points_to_upsert)
        except Exception as e:
            logger.error(f"Error upserting processed chunks to Qdrant for document: {doc_name_for_logging}: {e}", exc_info=True)
            raise

    def search_documents(self, query: str, k: int = -1, filter_conditions: Optional[models.Filter] = None) -> Tuple[List[Document], str, Dict]:
        if k <= 0:
            k_to_use = config.QDRANT_DEFAULT_SEARCH_K
        else:
            k_to_use = k

        context_docs = []
        formatted_context_text = "No relevant context was found in the available documents."
        context_docs_map = {}

        logger.info(f"Searching with query (first 50 chars): '{query[:50]}...', k: {k_to_use}")
        if filter_conditions:
            try: filter_dict = filter_conditions.dict() # For Pydantic v1
            except AttributeError:
                try: filter_dict = filter_conditions.model_dump() # For Pydantic v2
                except AttributeError: filter_dict = str(filter_conditions) # Fallback
            logger.info(f"Applying filter: {filter_dict}")
        else:
            logger.info("No filter applied for search.")

        try:
            query_embedding = self.model.encode(query).tolist()
            logger.debug(f"Generated query_embedding (length: {len(query_embedding)}, first 5 dims: {query_embedding[:5]})")

            search_results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                query_filter=filter_conditions,
                limit=k_to_use,
                with_payload=True,
                score_threshold=config.QDRANT_SEARCH_MIN_RELEVANCE_SCORE
            )
            logger.info(f"Qdrant client.search returned {len(search_results)} results (after score threshold).")

            if not search_results:
                return context_docs, formatted_context_text, context_docs_map

            for idx, point in enumerate(search_results):
                payload = point.payload
                content = payload.get("chunk_text_content", payload.get("text_content", payload.get("chunk_text", "")))

                retrieved_metadata = payload.copy()
                retrieved_metadata["qdrant_id"] = point.id
                retrieved_metadata["score"] = point.score

                doc = Document(page_content=content, metadata=retrieved_metadata)
                context_docs.append(doc)

            formatted_context_parts = []
            for i, doc_obj in enumerate(context_docs):
                citation_index = i + 1
                doc_meta = doc_obj.metadata
                display_subject = doc_meta.get("title", doc_meta.get("subject", "Unknown Subject"))
                # Use 'file_name' first (as per Qdrant payload), then 'original_name'
                doc_name = doc_meta.get("file_name", doc_meta.get("original_name", "N/A"))
                page_num_info = f" (Page: {doc_meta.get('page_number', 'N/A')})" if doc_meta.get('page_number') else ""
                
                content_preview = doc_obj.page_content[:200] + "..." if len(doc_obj.page_content) > 200 else doc_obj.page_content

                formatted = (f"[{citation_index}] Score: {doc_meta.get('score', 0.0):.4f} | "
                             f"Source: {doc_name}{page_num_info} | Subject: {display_subject}\n"
                             f"Content: {content_preview}")
                formatted_context_parts.append(formatted)

                context_docs_map[str(citation_index)] = {
                    "subject": display_subject,
                    "document_name": doc_name,
                    "page_number": doc_meta.get("page_number"),
                    "content_preview": content_preview,
                    "full_content": doc_obj.page_content,
                    "score": doc_meta.get("score", 0.0),
                    "qdrant_id": doc_meta.get("qdrant_id"),
                    "original_metadata": doc_meta
                }
            if formatted_context_parts:
                formatted_context_text = "\n\n---\n\n".join(formatted_context_parts)
            else:
                formatted_context_text = "No sufficiently relevant context was found after filtering."

        except Exception as e:
            logger.error(f"Qdrant search/RAG error: {e}", exc_info=True)
            formatted_context_text = "Error retrieving context due to an internal server error."

        return context_docs, formatted_context_text, context_docs_map

    def delete_document_embeddings(self, user_id: str, original_name: str) -> int:
        """
        Deletes all points (embeddings) associated with a specific original_name and user_id.
        'original_name' from the API call maps to 'file_name' in the Qdrant payload.
        'user_id' from the API call maps to 'processing_user' in the Qdrant payload.

        Args:
            user_id: The ID of the user (will be matched against 'processing_user' in Qdrant payload).
            original_name: The original name of the document (will be matched against 'file_name' in Qdrant payload).

        Returns:
            The number of points confirmed or targeted for deletion.

        Raises:
            Exception: If the deletion operation fails or returns an unexpected status.
        """
        logger.info(f"Attempting to delete embeddings for user_id (maps to 'processing_user')='{user_id}', "
                    f"original_name (maps to 'file_name' in Qdrant)='{original_name}' "
                    f"from collection '{self.collection_name}'.")

        # Define the filter conditions using the ACTUAL keys in your Qdrant payload
        filter_conditions = models.Filter(
            must=[
                models.FieldCondition(
                    key="processing_user",  # This is the key in Qdrant for user_id
                    match=models.MatchValue(value=user_id)
                ),
                models.FieldCondition(
                    key="file_name",        # This is the key in Qdrant for original_name
                    match=models.MatchValue(value=original_name)
                )
            ]
        )

        try:
            count_response = self.client.count(
                collection_name=self.collection_name,
                count_filter=filter_conditions,
                exact=True
            )
            num_to_delete = count_response.count
            logger.info(f"Found {num_to_delete} points matching criteria for processing_user='{user_id}', file_name='{original_name}'.")

            if num_to_delete == 0:
                logger.info("No points to delete.")
                return 0

            delete_result = self.client.delete(
                collection_name=self.collection_name,
                points_selector=models.FilterSelector(filter=filter_conditions),
                wait=True
            )

            logger.info(f"Deletion operation for processing_user='{user_id}', file_name='{original_name}' "
                        f"completed with status: {delete_result.status}. Expected to delete: {num_to_delete} points.")

            if delete_result.status == models.UpdateStatus.COMPLETED:
                logger.info(f"Successfully deleted {num_to_delete} points for processing_user='{user_id}', file_name='{original_name}'.")
                return num_to_delete
            elif delete_result.status == models.UpdateStatus.ACKNOWLEDGED:
                logger.warning(f"Deletion operation acknowledged (status: {delete_result.status}) for {num_to_delete} points "
                               f"for processing_user='{user_id}', file_name='{original_name}'. Assuming success as points were targeted.")
                return num_to_delete
            else:
                error_msg = (f"Qdrant deletion operation for processing_user='{user_id}', file_name='{original_name}' "
                             f"returned unexpected status: {delete_result.status}. Expected to delete {num_to_delete} points.")
                logger.error(error_msg)
                raise Exception(error_msg)

        except Exception as e:
            logger.error(f"Error during deletion process for processing_user='{user_id}', file_name='{original_name}': {e}", exc_info=True)
            raise

    def close(self):
        logger.info("VectorDBService close called.")
        # QdrantClient does not have an explicit close() method.