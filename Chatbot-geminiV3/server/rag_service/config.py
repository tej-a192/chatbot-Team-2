# server/config.py
import os
import logging

# ─── Logging Configuration ───────────────────────────
logger = logging.getLogger(__name__)
LOGGING_LEVEL_NAME = os.getenv('LOGGING_LEVEL', 'INFO').upper()
LOGGING_LEVEL      = getattr(logging, LOGGING_LEVEL_NAME, logging.INFO)
LOGGING_FORMAT     = '%(asctime)s - %(levelname)s - [%(name)s:%(lineno)d] - %(message)s'

# === Base Directory ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
logger.info(f"[Config] Base Directory: {BASE_DIR}")



def setup_logging():
    """Configure logging across the app."""
    root_logger = logging.getLogger()
    if not root_logger.handlers:  # prevent duplicate handlers
        handler = logging.StreamHandler()
        formatter = logging.Formatter(LOGGING_FORMAT)
        handler.setFormatter(formatter)
        root_logger.addHandler(handler)
        root_logger.setLevel(LOGGING_LEVEL)

    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("faiss.loader").setLevel(logging.WARNING)
    logging.getLogger(__name__).info(f"Logging initialized at {LOGGING_LEVEL_NAME}")

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password") # IMPORTANT: Change this default or use ENV VAR!
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")
# === Embedding Model Configuration ===
DEFAULT_DOC_EMBED_MODEL = 'mixedbread-ai/mxbai-embed-large-v1'
DOCUMENT_EMBEDDING_MODEL_NAME = os.getenv('DOCUMENT_EMBEDDING_MODEL_NAME', DEFAULT_DOC_EMBED_MODEL)
MAX_TEXT_LENGTH_FOR_NER = int(os.getenv("MAX_TEXT_LENGTH_FOR_NER", 500000))
logger.info(f"[Config] Document Embedding Model: {DOCUMENT_EMBEDDING_MODEL_NAME}")

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
logger.info(f"[Config] Document Vector Dimension: {DOCUMENT_VECTOR_DIMENSION}")

# === AI Core Chunking Config ===
AI_CORE_CHUNK_SIZE = int(os.getenv("AI_CORE_CHUNK_SIZE", 512))
AI_CORE_CHUNK_OVERLAP = int(os.getenv("AI_CORE_CHUNK_OVERLAP", 100))
logger.info(f"[Config] Chunk Size: {AI_CORE_CHUNK_SIZE}, Overlap: {AI_CORE_CHUNK_OVERLAP}")

# === SpaCy Configuration ===
SPACY_MODEL_NAME = os.getenv('SPACY_MODEL_NAME', 'en_core_web_sm')
logger.info(f"[Config] SpaCy Model: {SPACY_MODEL_NAME}")

# === Qdrant Configuration ===
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))
QDRANT_COLLECTION_NAME = os.getenv("QDRANT_COLLECTION_NAME", "my_qdrant_rag_collection")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", None)
QDRANT_URL = os.getenv("QDRANT_URL", None)

QDRANT_COLLECTION_VECTOR_DIM = DOCUMENT_VECTOR_DIMENSION
logger.info(f"[Config] Qdrant Vector Dimension: {QDRANT_COLLECTION_VECTOR_DIM}")

# === Query Embedding Configuration ===
QUERY_EMBEDDING_MODEL_NAME = os.getenv("QUERY_EMBEDDING_MODEL_NAME", DOCUMENT_EMBEDDING_MODEL_NAME)
QUERY_VECTOR_DIMENSION = int(os.getenv(
    "QUERY_VECTOR_DIMENSION",
    _MODEL_TO_DIM_MAPPING.get(QUERY_EMBEDDING_MODEL_NAME, _FALLBACK_DIM)
))

if QUERY_VECTOR_DIMENSION != QDRANT_COLLECTION_VECTOR_DIM:
    logger.info(f"[⚠️ Config Warning] Query vector dim ({QUERY_VECTOR_DIMENSION}) != Qdrant dim ({QDRANT_COLLECTION_VECTOR_DIM})")
    # Optionally enforce consistency
    # raise ValueError("Query and Document vector dimensions do not match!")
else:
    logger.info(f"[Config] Query Model: {QUERY_EMBEDDING_MODEL_NAME}")
    logger.info(f"[Config] Query Vector Dimension: {QUERY_VECTOR_DIMENSION}")

QDRANT_DEFAULT_SEARCH_K = int(os.getenv("QDRANT_DEFAULT_SEARCH_K", 5))
QDRANT_SEARCH_MIN_RELEVANCE_SCORE = float(os.getenv("QDRANT_SEARCH_MIN_RELEVANCE_SCORE", 0.1))

# === API Port Configuration ===
API_PORT = int(os.getenv('API_PORT', 5000))
logger.info(f"[Config] API Running Port: {API_PORT}")

# === Optional: Tesseract OCR Path (uncomment if used) ===
# TESSERACT_CMD = os.getenv('TESSERACT_CMD')
# if TESSERACT_CMD:
#     import pytesseract
#     pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
#     logger.info(f"[Config] Tesseract Path: {TESSERACT_CMD}")


# ─── Library Availability Flags ──────────────────────
try:
    import pypdf
    PYPDF_AVAILABLE      = True
    PYPDF_PDFREADERROR   = pypdf.errors.PdfReadError
except ImportError:
    PYPDF_AVAILABLE      = False
    PYPDF_PDFREADERROR   = Exception

try:
    from docx import Document as DocxDocument
    DOCX_AVAILABLE       = True
except ImportError:
    DOCX_AVAILABLE       = False
    DocxDocument         = None

try:
    from pptx import Presentation
    PPTX_AVAILABLE       = True
except ImportError:
    PPTX_AVAILABLE       = False
    Presentation         = None

try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    PDFPLUMBER_AVAILABLE = False
    pdfplumber           = None

try:
    import pandas as pd
    PANDAS_AVAILABLE     = True
except ImportError:
    PANDAS_AVAILABLE     = False
    pd                   = None

try:
    from PIL import Image
    PIL_AVAILABLE        = True
except ImportError:
    PIL_AVAILABLE        = False
    Image                = None

try:
    import fitz
    FITZ_AVAILABLE       = True
except ImportError:
    FITZ_AVAILABLE       = False
    fitz                 = None

try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
    TESSERACT_ERROR       = pytesseract.TesseractNotFoundError
except ImportError:
    PYTESSERACT_AVAILABLE = False
    pytesseract           = None
    TESSERACT_ERROR       = Exception

try:
    import PyPDF2
    PYPDF2_AVAILABLE      = True
except ImportError:
    PYPDF2_AVAILABLE      = False
    PyPDF2                = None

# ─── Optional: Preload SpaCy & Embedding Model ───────

TESSERACT_CMD = os.getenv('TESSERACT_CMD', r'C:\Program Files\Tesseract-OCR\tesseract.exe')

if PYTESSERACT_AVAILABLE and pytesseract:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
    logger.info(f"[Config] Tesseract Path set to: {TESSERACT_CMD}")

try:
    import spacy
    SPACY_LIB_AVAILABLE = True
    nlp_spacy_core      = spacy.load(SPACY_MODEL_NAME)
    SPACY_MODEL_LOADED  = True
except Exception as e:
    SPACY_LIB_AVAILABLE = False
    nlp_spacy_core      = None
    SPACY_MODEL_LOADED  = False
    logger.warning(f"Failed to load SpaCy model '{SPACY_MODEL_NAME}': {e}")

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_LIB_AVAILABLE = True
    document_embedding_model = SentenceTransformer(DOCUMENT_EMBEDDING_MODEL_NAME)
    EMBEDDING_MODEL_LOADED = True
except Exception as e:
    SENTENCE_TRANSFORMERS_LIB_AVAILABLE = False
    document_embedding_model = None
    EMBEDDING_MODEL_LOADED = False
    logger.warning(f"Failed to load Sentence transformers: {e}")

try:
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    LANGCHAIN_SPLITTER_AVAILABLE = True
except ImportError:
    LANGCHAIN_SPLITTER_AVAILABLE = False
    RecursiveCharacterTextSplitter = None # Placeholder