# server/config.py
import os

# === Base Directory ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
print(f"[Config] Base Directory: {BASE_DIR}")

# === Embedding Model Configuration ===
DEFAULT_DOC_EMBED_MODEL = 'mixedbread-ai/mxbai-embed-large-v1'
DOCUMENT_EMBEDDING_MODEL_NAME = os.getenv('DOCUMENT_EMBEDDING_MODEL_NAME', DEFAULT_DOC_EMBED_MODEL)
print(f"[Config] Document Embedding Model: {DOCUMENT_EMBEDDING_MODEL_NAME}")

# Model dimension mapping
_MODEL_TO_DIM_MAPPING = {
    'mixedbread-ai/mxbai-embed-large-v1': 1024,
    'BAAI/bge-large-en-v1.5': 1024,
    'all-MiniLM-L6-v2': 384,
    'sentence-transformers/all-mpnet-base-v2': 768,
}
_FALLBACK_DIM = 768

DOCUMENT_VECTOR_DIMENSION = int(os.getenv(
    "DOCUMENT_VECTOR_DIMENSION",
    _MODEL_TO_DIM_MAPPING.get(DOCUMENT_EMBEDDING_MODEL_NAME, _FALLBACK_DIM)
))
print(f"[Config] Document Vector Dimension: {DOCUMENT_VECTOR_DIMENSION}")

# === AI Core Chunking Config ===
AI_CORE_CHUNK_SIZE = int(os.getenv("AI_CORE_CHUNK_SIZE", 512))
AI_CORE_CHUNK_OVERLAP = int(os.getenv("AI_CORE_CHUNK_OVERLAP", 100))
print(f"[Config] Chunk Size: {AI_CORE_CHUNK_SIZE}, Overlap: {AI_CORE_CHUNK_OVERLAP}")

# === SpaCy Configuration ===
SPACY_MODEL_NAME = os.getenv('SPACY_MODEL_NAME', 'en_core_web_sm')
print(f"[Config] SpaCy Model: {SPACY_MODEL_NAME}")

# === Qdrant Configuration ===
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))
QDRANT_COLLECTION_NAME = os.getenv("QDRANT_COLLECTION_NAME", "my_qdrant_rag_collection")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)
QDRANT_URL = os.getenv("QDRANT_URL", None)

QDRANT_COLLECTION_VECTOR_DIM = DOCUMENT_VECTOR_DIMENSION
print(f"[Config] Qdrant Vector Dimension: {QDRANT_COLLECTION_VECTOR_DIM}")

# === Query Embedding Configuration ===
QUERY_EMBEDDING_MODEL_NAME = os.getenv("QUERY_EMBEDDING_MODEL_NAME", DOCUMENT_EMBEDDING_MODEL_NAME)
QUERY_VECTOR_DIMENSION = int(os.getenv(
    "QUERY_VECTOR_DIMENSION",
    _MODEL_TO_DIM_MAPPING.get(QUERY_EMBEDDING_MODEL_NAME, _FALLBACK_DIM)
))

if QUERY_VECTOR_DIMENSION != QDRANT_COLLECTION_VECTOR_DIM:
    print(f"[⚠️ Config Warning] Query vector dim ({QUERY_VECTOR_DIMENSION}) != Qdrant dim ({QDRANT_COLLECTION_VECTOR_DIM})")
    # Optionally enforce consistency
    # raise ValueError("Query and Document vector dimensions do not match!")
else:
    print(f"[Config] Query Model: {QUERY_EMBEDDING_MODEL_NAME}")
    print(f"[Config] Query Vector Dimension: {QUERY_VECTOR_DIMENSION}")

QDRANT_DEFAULT_SEARCH_K = int(os.getenv("QDRANT_DEFAULT_SEARCH_K", 5))
QDRANT_SEARCH_MIN_RELEVANCE_SCORE = float(os.getenv("QDRANT_SEARCH_MIN_RELEVANCE_SCORE", 0.1))

# === API Port Configuration ===
API_PORT = int(os.getenv('API_PORT', 5000))
print(f"[Config] API Running Port: {API_PORT}")

# === Optional: Tesseract OCR Path (uncomment if used) ===
# TESSERACT_CMD = os.getenv('TESSERACT_CMD')
# if TESSERACT_CMD:
#     import pytesseract
#     pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
#     print(f"[Config] Tesseract Path: {TESSERACT_CMD}")
