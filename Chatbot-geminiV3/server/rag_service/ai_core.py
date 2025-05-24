# ./ai_core.py

# Standard Library Imports
import os
import io
import re
import logging
import copy # Used in chunk_document_into_segments

# Typing Imports
from typing import Optional, List, Dict, Any, Callable # 'callable' used for type hint in _get_parser_for_file

# --- Configuration Import ---
# This assumes 'rag_service/config.py' exists and is importable.
# Your config.py should define:
# - EMBEDDING_MODEL_NAME (e.g., 'mixedbread-ai/mxbai-embed-large-v1')
# - CHUNK_SIZE (e.g., 512)
# - CHUNK_OVERLAP (e.g., 100)
# - SPACY_MODEL_NAME (e.g., 'en_core_web_sm') for SpaCy initialization
# - Optionally: MAX_TEXT_LENGTH_FOR_NER (defaults to 500000 in metadata extraction if not set)
try:
    from rag_service import config
except ImportError as e:
    # If this happens, the script will likely fail when 'config.XXX' is accessed.
    # Ensure 'rag_service' is in PYTHONPATH or structured correctly.
    logging.basicConfig(level=logging.CRITICAL) # Basic logging for this critical error
    logging.getLogger(__name__).critical(
        f"CRITICAL: Failed to import 'config' from 'rag_service': {e}. "
        "The application will not be able to load necessary configurations (model names, chunk sizes, etc.) "
        "and will likely fail. Please ensure rag_service/config.py is correctly set up and accessible."
    )
    # To prevent immediate crashes on 'config.XXX' if the script tries to proceed,
    # we can define a dummy config, but it's better to fix the import.
    # This is a last resort to allow the rest of the imports to be defined.
    class DummyConfig:
        EMBEDDING_MODEL_NAME = None
        CHUNK_SIZE = 1000
        CHUNK_OVERLAP = 200
        SPACY_MODEL_NAME = None # Ensure this is handled if config is missing
        MAX_TEXT_LENGTH_FOR_NER = 500000
    config = DummyConfig()
    # It's highly recommended to fix the import issue rather than relying on this dummy.


# --- Global Initializations ---

# 1. Logger Setup
logger = logging.getLogger(__name__)
# Configure logging if not handled by a higher-level application entry point
if not logger.hasHandlers():
    _handler = logging.StreamHandler()
    _formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    _handler.setFormatter(_formatter)
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO) # Default level, can be overridden


# 2. Optional Library Imports and Availability Flags / Placeholders

# pypdf (for PDF text extraction)
try:
    import pypdf
    from pypdf.errors import PdfReadError # Specifically used for more granular error handling
    PYPDF_AVAILABLE = True
except ImportError:
    pypdf = None
    PdfReadError = type('PdfReadError', (Exception,), {}) # Dummy for type hint / except block
    PYPDF_AVAILABLE = False
    logger.info("pypdf library not found. PDF parsing capabilities with pypdf will be unavailable.")

# python-docx (for DOCX parsing)
try:
    from docx import Document as DocxDocument
    DOCX_AVAILABLE = True
except ImportError:
    DocxDocument = None
    DOCX_AVAILABLE = False
    logger.info("python-docx library not found. DOCX parsing will be unavailable.")

# python-pptx (for PPTX parsing)
try:
    from pptx import Presentation
    PPTX_AVAILABLE = True
except ImportError:
    Presentation = None
    PPTX_AVAILABLE = False
    logger.info("python-pptx library not found. PPTX parsing will be unavailable.")

# pdfplumber (for richer PDF text/table extraction)
try:
    import pdfplumber
    PDFPLUMBER_AVAILABLE = True
except ImportError:
    pdfplumber = None
    PDFPLUMBER_AVAILABLE = False
    logger.info("pdfplumber library not found. Rich PDF text/table extraction will be unavailable.")

# pandas (for DataFrame operations, table handling, timestamps)
try:
    import pandas as pd
    PANDAS_AVAILABLE = True
except ImportError:
    pd = None
    PANDAS_AVAILABLE = False
    logger.warning("pandas library not found. Table processing and some metadata operations might be impacted.")

# Pillow (PIL) (for image manipulation)
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    Image = None
    PIL_AVAILABLE = False
    logger.info("Pillow (PIL) library not found. Image processing will be unavailable (affects OCR and PDF image handling).")

# PyMuPDF (fitz) (for PDF image extraction)
try:
    import fitz  # PyMuPDF
    FITZ_AVAILABLE = True
except ImportError:
    fitz = None
    FITZ_AVAILABLE = False
    logger.info("PyMuPDF (fitz) library not found. PDF image extraction via fitz will be unavailable.")

# pytesseract (for OCR)
try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    pytesseract = None
    PYTESSERACT_AVAILABLE = False
    logger.info("pytesseract library not found. OCR functionality will be unavailable.")

# PyPDF2 (specifically for PDF metadata in your code)
try:
    import PyPDF2
    PYPDF2_AVAILABLE = True
except ImportError:
    PyPDF2 = None
    PYPDF2_AVAILABLE = False
    logger.info("PyPDF2 library not found. PDF metadata extraction using PyPDF2 might fail.")

# Langchain for Text Splitting
try:
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    LANGCHAIN_SPLITTER_AVAILABLE = True
except ImportError:
    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter # Fallback for older langchain
        LANGCHAIN_SPLITTER_AVAILABLE = True
        logger.debug("Using RecursiveCharacterTextSplitter from langchain.text_splitter (older path).")
    except ImportError:
        RecursiveCharacterTextSplitter = None # Critical for chunking
        LANGCHAIN_SPLITTER_AVAILABLE = False
        logger.critical("Langchain text splitter (RecursiveCharacterTextSplitter) not found. Text chunking will fail.")


# 3. NLP Model Initializations

# SpaCy Model (for NER, lemmatization, etc.)
nlp_spacy_core = None
SPACY_MODEL_LOADED = False # Flag to indicate if SpaCy model is ready
try:
    import spacy
    SPACY_LIB_AVAILABLE = True
except ImportError:
    SPACY_LIB_AVAILABLE = False
    logger.warning("spacy library not found. SpaCy model cannot be loaded. Advanced text processing (lemmatization, NER) will be impacted.")

if SPACY_LIB_AVAILABLE:
    # SPACY_MODEL_NAME should be defined in your rag_service/config.py
    # e.g., SPACY_MODEL_NAME = 'en_core_web_sm'
    spacy_model_name_from_config = getattr(config, 'SPACY_MODEL_NAME', None)
    if spacy_model_name_from_config:
        try:
            nlp_spacy_core = spacy.load(spacy_model_name_from_config)
            SPACY_MODEL_LOADED = True
            logger.info(f"SpaCy model '{spacy_model_name_from_config}' loaded successfully.")
        except OSError:
            logger.error(
                f"SpaCy model '{spacy_model_name_from_config}' not found. "
                f"You may need to download it (e.g., 'python -m spacy download {spacy_model_name_from_config}'). "
                "NER and advanced tokenization will be impacted."
            )
        except Exception as e:
            logger.error(f"Unexpected error loading SpaCy model '{spacy_model_name_from_config}': {e}")
    else:
        logger.warning(
            "config.SPACY_MODEL_NAME not defined or empty in rag_service/config.py. "
            "SpaCy model not loaded. NER and advanced tokenization will be impacted."
        )

# Sentence Transformer Model (for generating embeddings)
document_embedding_model = None
EMBEDDING_MODEL_LOADED = False # Flag to indicate if the embedding model is ready
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_LIB_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_LIB_AVAILABLE = False
    logger.critical(
        "sentence-transformers library not found. "
        "Embedding model cannot be loaded. Embedding generation will fail."
    )

if SENTENCE_TRANSFORMERS_LIB_AVAILABLE:
    # EMBEDDING_MODEL_NAME should be defined in your rag_service/config.py
    embedding_model_name_from_config = getattr(config, 'EMBEDDING_MODEL_NAME', None)
    if embedding_model_name_from_config:
        try:
            document_embedding_model = SentenceTransformer(embedding_model_name_from_config)
            EMBEDDING_MODEL_LOADED = True
            logger.info(f"Sentence Transformer embedding model '{embedding_model_name_from_config}' loaded successfully.")
        except Exception as e:
            logger.error(
                f"Error loading Sentence Transformer model '{embedding_model_name_from_config}': {e}. "
                "Embedding generation will likely fail."
            )
    else:
        logger.critical(
            "config.EMBEDDING_MODEL_NAME not defined or empty in rag_service/config.py. "
            "Sentence Transformer model not loaded. Embedding generation will fail."
        )

# --- End of Imports and Global Initializations ---


# --- Stage 1: File Parsing and Raw Content Extraction ---

def _parse_pdf_content(file_path: str) -> Optional[str]:
    """Extracts text content from a PDF file using pypdf."""
    if not pypdf:
        logger.error("pypdf library not found. PDF parsing will fail.")
        return None
    text_content = ""
    try:
        reader = pypdf.PdfReader(file_path)
        num_pages = len(reader.pages)
        # logger.info(f"Reading {num_pages} pages from PDF: {os.path.basename(file_path)} (pypdf)")
        for i, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text()
                if page_text:
                    text_content += page_text + "\n"
            except Exception as page_err:
                logger.warning(f"pypdf: Error extracting text from page {i+1} of {os.path.basename(file_path)}: {page_err}")
        logger.debug(f"pypdf: Extracted {len(text_content)} characters from PDF.")
        return text_content.strip() if text_content.strip() else None
    except FileNotFoundError:
        logger.error(f"pypdf: File not found: {file_path}")
        return None
    except pypdf.errors.PdfReadError as pdf_err: # More specific error
        logger.error(f"pypdf: Error reading PDF {os.path.basename(file_path)} (possibly corrupted or encrypted): {pdf_err}")
        return None
    except Exception as e:
        logger.error(f"pypdf: Unexpected error parsing PDF {os.path.basename(file_path)}: {e}", exc_info=True)
        return None


def _parse_docx_content(file_path: str) -> Optional[str]:
    """Extracts text content from a DOCX file."""
    if not DOCX_AVAILABLE or not DocxDocument:
        logger.error("python-docx library not found or not imported. DOCX parsing will fail.")
        return None
    try:
        doc = DocxDocument(file_path)
        text_content = "\n".join([para.text for para in doc.paragraphs if para.text.strip()])
        logger.debug(f"docx: Extracted {len(text_content)} characters from DOCX: {os.path.basename(file_path)}")
        return text_content.strip() if text_content.strip() else None
    except FileNotFoundError:
        logger.error(f"docx: File not found: {file_path}")
        return None
    except Exception as e: # Catches errors from python-docx itself, like bad OOXML format
        logger.error(f"docx: Error parsing DOCX {os.path.basename(file_path)}: {e}", exc_info=True)
        return None


def _parse_txt_content(file_path: str) -> Optional[str]:
    """Reads text content from a TXT file."""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            text_content = f.read()
        logger.debug(f"txt: Read {len(text_content)} characters from TXT file: {os.path.basename(file_path)}")
        return text_content.strip() if text_content.strip() else None
    except FileNotFoundError:
        logger.error(f"txt: File not found: {file_path}")
        return None
    except Exception as e:
        logger.error(f"txt: Error parsing TXT {os.path.basename(file_path)}: {e}", exc_info=True)
        return None


def _parse_pptx_content(file_path: str) -> Optional[str]:
    """Extracts text content from a PPTX file."""
    if not PPTX_AVAILABLE or not Presentation:
        logger.warning(f"python-pptx not installed or not imported. PPTX parsing for {os.path.basename(file_path)} will be skipped.")
        return None
    text_content = ""
    try:
        prs = Presentation(file_path)
        for slide_num, slide in enumerate(prs.slides):
            slide_text_parts = []
            for shape in slide.shapes:
                if hasattr(shape, "text"): # Check if shape has text frame
                    shape_text = shape.text.strip()
                    if shape_text:
                        slide_text_parts.append(shape_text)
            if slide_text_parts:
                text_content += "\n".join(slide_text_parts) + "\n\n"
        logger.debug(f"pptx: Extracted {len(text_content)} characters from PPTX: {os.path.basename(file_path)}")
        return text_content.strip() if text_content.strip() else None
    except FileNotFoundError:
        logger.error(f"pptx: File not found: {file_path}")
        return None
    except Exception as e: # Catches errors from python-pptx
        logger.error(f"pptx: Error parsing PPTX {os.path.basename(file_path)}: {e}", exc_info=True)
        return None


def _get_parser_for_file(file_path: str) -> Optional[callable]:
    """Returns the appropriate parsing function based on file extension."""
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()
    logger.debug(f"Determining parser for extension: {ext} (file: {os.path.basename(file_path)})")

    if ext == '.pdf':
        return _parse_pdf_content
    elif ext == '.docx':
        return _parse_docx_content
    elif ext == '.pptx':
        return _parse_pptx_content
    elif ext in ['.txt', '.py', '.js', '.md', '.log', '.csv', '.html', '.xml', '.json']: # Expanded list
        return _parse_txt_content
    elif ext == '.doc':
        logger.warning(f"Parsing for legacy .doc files is not implemented: {os.path.basename(file_path)}")
        return None
    else:
        logger.warning(f"Unsupported file extension for basic parsing: {ext} ({os.path.basename(file_path)})")
        return None


def extract_raw_content_from_file(file_path: str) -> Dict[str, Any]:
    """
    Extracts raw text, tables, images from a document.
    Determines if the document (if PDF) is likely scanned.
    """
    file_base_name = os.path.basename(file_path)
    logger.info(f"Starting raw content extraction for: {file_base_name}")
    
    text_content: str = ""
    tables: List[Any] = []
    images: List[Image.Image] = []
    is_scanned: bool = False
    file_extension: str = os.path.splitext(file_path)[1].lower()

    # 1. Initial text extraction using basic parsers
    parser_func = _get_parser_for_file(file_path)
    if parser_func:
        initial_text = parser_func(file_path)
        if initial_text:
            text_content = initial_text
    
    if not text_content and file_extension != '.pdf': # For non-PDFs, if no text, little else to do
        logger.warning(f"Could not extract initial text from {file_base_name} (type: {file_extension}).")
        # Fall through, it might be an image file or PDF to be OCR'd later

    # 2. Richer PDF processing (if it's a PDF)
    if file_extension == '.pdf':
        # Try with pdfplumber for potentially better text and tables
        if PDFPLUMBER_AVAILABLE:
            try:
                with pdfplumber.open(file_path) as pdf:
                    pdfplumber_text_parts = []
                    page_count_for_scan_check = len(pdf.pages)
                    
                    for page in pdf.pages:
                        page_text = page.extract_text(x_tolerance=1, y_tolerance=1) # Basic extraction
                        if page_text:
                            pdfplumber_text_parts.append(page_text)
                    
                    full_pdfplumber_text = "\n".join(pdfplumber_text_parts)

                    # Scanned PDF heuristic
                    min_chars_per_page = 50 
                    absolute_min_chars = 200
                    if page_count_for_scan_check > 0 and \
                       (len(full_pdfplumber_text) < min_chars_per_page * page_count_for_scan_check and \
                        len(full_pdfplumber_text) < absolute_min_chars):
                        is_scanned = True
                        logger.info(f"PDF {file_base_name} detected as potentially scanned (low text from pdfplumber).")

                    # If pdfplumber got more text, prefer it
                    if len(full_pdfplumber_text.strip()) > len(text_content.strip()):
                        logger.info(f"Using text extracted by pdfplumber for {file_base_name} as it's more comprehensive.")
                        text_content = full_pdfplumber_text.strip()
                    elif not text_content.strip() and full_pdfplumber_text.strip(): # If pypdf failed but pdfplumber got something
                        text_content = full_pdfplumber_text.strip()


                    # Extract tables using pdfplumber (do this regardless of scanned status for now)
                    for page_num, page in enumerate(pdf.pages):
                        page_tables_data = page.extract_tables()
                        if page_tables_data:
                            for table_data_list in page_tables_data:
                                if table_data_list: # Ensure table_data_list is not empty
                                    try:
                                        # Try to make a DataFrame, assuming first row is header
                                        # This is a heuristic; real table structure can be complex
                                        if len(table_data_list) > 1 and all(isinstance(cell, str) or cell is None for cell in table_data_list[0]):
                                            df = pd.DataFrame(table_data_list[1:], columns=table_data_list[0])
                                            tables.append(df)
                                        else: # Treat as list of lists if no clear header
                                            tables.append(table_data_list)
                                    except Exception as df_err:
                                        logger.warning(f"pdfplumber: Could not convert table to DataFrame on page {page_num} for {file_base_name}: {df_err}. Appending raw list.")
                                        tables.append(table_data_list)
                    logger.info(f"pdfplumber: Extracted {len(tables)} tables from {file_base_name}.")

            except Exception as e:
                logger.warning(f"pdfplumber: Error during rich PDF processing for {file_base_name}: {e}. Relaying on pypdf text if any.")
        else: # pdfplumber not available
            logger.warning("pdfplumber is not available. Rich PDF table/layout extraction will be skipped.")
            # is_scanned heuristic for pypdf (if pdfplumber is not available)
            if not text_content.strip() and pypdf: # If pypdf also extracted nothing or very little
                try:
                    reader_scan_check = pypdf.PdfReader(file_path)
                    if len(reader_scan_check.pages) > 0: # Only if there are pages
                         is_scanned = True # A simpler heuristic: if pypdf gets nothing, assume scanned.
                         logger.info(f"PDF {file_base_name} detected as potentially scanned (no text from pypdf).")
                except:
                    pass # Ignore errors here, already logged by _parse_pdf_content


        # Extract images using PyMuPDF (fitz) - this is independent of pdfplumber
        try:
            doc = fitz.open(file_path)
            for page_idx in range(len(doc)):
                for img_info in doc.get_page_images(page_idx):
                    xref = img_info[0]
                    try:
                        base_image = doc.extract_image(xref)
                        image_bytes = base_image["image"]
                        pil_image = Image.open(io.BytesIO(image_bytes))
                        images.append(pil_image)
                    except Exception as img_err:
                        logger.warning(f"fitz: Could not open image xref {xref} from page {page_idx} of {file_base_name}: {img_err}")
            doc.close()
            logger.info(f"fitz: Extracted {len(images)} images from {file_base_name}.")
        except Exception as e:
            logger.warning(f"fitz: Error extracting images from PDF {file_base_name}: {e}")

    # If no text extracted by parsers, and it's an image file type, treat as "scanned" for OCR
    if not text_content.strip() and file_extension in ['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.gif']:
        logger.info(f"File {file_base_name} is an image type with no prior text. Marking for OCR.")
        is_scanned = True # Signal that OCR should be attempted
        try:
            images.append(Image.open(file_path)) # Load the image itself
        except Exception as e:
            logger.error(f"Could not open image file {file_base_name} directly: {e}")


    logger.info(f"Raw content extraction complete for {file_base_name}. Text length: {len(text_content)}, Tables: {len(tables)}, Images: {len(images)}, Scanned: {is_scanned}")
    return {
        'text_content': text_content.strip(), # Ensure stripped
        'tables': tables,
        'images': images,
        'layout_info': [], # Placeholder for now, complex layout is a separate deep dive
        'is_scanned': is_scanned,
        'file_type': file_extension
    }


# --- Stage 2: OCR ---

def perform_ocr_on_images(image_objects: List[Image.Image]) -> str:
    """
    Processes a list of PIL Image objects to extract text using OCR (pytesseract).
    Returns a single string concatenating text from all images.
    """
    if not image_objects:
        logger.info("No image objects provided for OCR. Skipping OCR step.")
        return ""

    logger.info(f"Performing OCR on {len(image_objects)} image(s).")
    ocr_text_parts: List[str] = []
    
    for i, img in enumerate(image_objects):
        try:
            # Basic preprocessing: Convert to grayscale, which often helps Tesseract.
            # More advanced preprocessing (e.g., binarization, noise removal, deskewing)
            # can be added here if needed, but start simple.
            img_gray = img.convert('L')
            
            # You can experiment with Tesseract configurations if default is not optimal
            # custom_config = r'--oem 3 --psm 6' # Example config
            # text = pytesseract.image_to_string(img_gray, config=custom_config)
            text = pytesseract.image_to_string(img_gray) # Using grayscale with default config

            if text and text.strip():
                ocr_text_parts.append(text.strip())
                logger.debug(f"OCR successful for image {i+1}/{len(image_objects)}.")
            else:
                logger.debug(f"No text found by OCR in image {i+1}/{len(image_objects)}.")

        except pytesseract.TesseractNotFoundError:
            logger.critical("Tesseract is not installed or not in your PATH. OCR will fail.")
            # This is a critical error. The main orchestrator should catch this.
            raise # Re-raise for the orchestrator to handle
        except Exception as e:
            # Log specific image OCR errors but continue with other images if possible
            logger.error(f"Error during OCR for image {i+1}/{len(image_objects)}: {e}", exc_info=True)
    
    if not ocr_text_parts:
        logger.info("OCR process completed, but no text was extracted from any image.")
        return ""
        
    full_ocr_text = "\n\n--- OCR Text from Image ---\n\n".join(ocr_text_parts) # Add separator for text from different images
    logger.info(f"OCR process completed. Extracted {len(full_ocr_text)} characters from {len(ocr_text_parts)} image(s) (out of {len(image_objects)} total).")
    return full_ocr_text

# --- Stage 3: Text Cleaning and Normalization ---

def clean_and_normalize_text_content(text: str) -> str:
    """
    Cleans and normalizes text content.
    - Removes HTML, URLs, emails.
    - Normalizes whitespace and case.
    - Removes non-essential punctuation.
    - Tokenizes, removes stop words, and lemmatizes.
    """
    if not text or not text.strip():
        logger.info("No text provided for cleaning and normalization, or text is only whitespace.")
        return ""
        
    logger.info(f"Starting text cleaning and normalization. Initial length: {len(text)}")

    # 1. Basic Noise Removal (Regex-based)
    # Remove HTML tags (more robustly than just <[^>]+> for some edge cases, but simple one is fine too)
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL) # Remove script tags and content
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.IGNORECASE | re.DOTALL)   # Remove style tags and content
    text = re.sub(r'<[^>]+>', ' ', text)  # Remove all other HTML tags, replace with space to avoid merging words

    # Remove URLs
    text = re.sub(r'http\S+|www\S+|https\S+', '', text, flags=re.MULTILINE)
    # Remove email addresses
    text = re.sub(r'\S*@\S*\s?', '', text)
    # Remove common boilerplate/navigation text if identifiable patterns exist (example)
    # text = re.sub(r'(navigation|skip to content|advertisement)', '', text, flags=re.IGNORECASE)

    # Replace multiple newlines/tabs with a single space, then normalize all whitespace
    text = re.sub(r'[\n\t\r]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()

    # Remove special characters, keeping alphanumeric, essential punctuation for sentence context.
    # This regex is a bit more permissive initially to help with sentence tokenization.
    # Further, more aggressive punctuation removal can happen after tokenization if needed.
    text = re.sub(r'[^\w\s.,!?-]', '', text) # \w includes underscore. If underscore is noise, add it to removal.

    # 2. Case Normalization
    text_lower = text.lower()
    logger.debug(f"Text after basic cleaning and lowercasing (first 200 chars): {text_lower[:200]}...")

    # 3. SpaCy Processing (Tokenization, Lemmatization, Stop Word/Punctuation Checks)
    # nlp_spacy_core should be your loaded SpaCy model (e.g., spacy.load("en_core_web_sm"))
    try:
        # Process the text with SpaCy. Disable components not needed for this stage for speed.
        # For lemmatization, 'tagger' and 'attribute_ruler' are often dependencies.
        # 'parser' and 'ner' can usually be disabled if only lemmatizing.
        # Test which components are truly minimal for your SpaCy model and lemmatization.
        # A common minimal set for lemmatization is ['tok2vec', 'tagger', 'attribute_ruler', 'lemmatizer']
        # If your spacy model is small (like en_core_web_sm), it might not have all components to disable.
        # This can be a point of optimization.
        doc = nlp_spacy_core(text_lower, disable=['parser', 'ner']) # Keep 'tagger' for lemmatization context
    except Exception as e:
        logger.error(f"SpaCy processing failed: {e}. Returning pre-cleaned text.", exc_info=True)
        return text_lower # Fallback to regex-cleaned text

    lemmatized_tokens: List[str] = []
    for token in doc:
        # Filter out stop words, punctuation, and very short tokens (often noise)
        # Also filter out space tokens, which can sometimes occur
        if not token.is_stop and \
           not token.is_punct and \
           not token.is_space and \
           len(token.lemma_) > 1: # Use lemma, check length of lemma
            lemmatized_tokens.append(token.lemma_)
            
    logger.debug(f"Processed with SpaCy. {len(lemmatized_tokens)} tokens remaining after filtering.")

    final_cleaned_text = " ".join(lemmatized_tokens)
    logger.info(f"SpaCy-based text cleaning and normalization complete. Final length: {len(final_cleaned_text)}")
    logger.info(f"Final cleaned text : {final_cleaned_text}")
    return final_cleaned_text


# --- Stage 4: Layout Reconstruction & Table Integration ---

def reconstruct_document_layout(
    text_content: str,
    tables_data: List[Any], # List of pd.DataFrame or list-of-lists
    file_type: str # Original file type, mainly for logging/context
) -> str:
    """
    Integrates extracted tables (as Markdown) into the text content
    and performs de-hyphenation.
    """
    if not text_content and not tables_data:
        logger.info("No text or tables provided for layout reconstruction.")
        return ""

    logger.info(f"Starting layout reconstruction for file type '{file_type}'. Initial text length: {len(text_content)}, Tables: {len(tables_data)}.")
    
    processed_text = text_content

    # 1. De-hyphenation
    # Regex to find a word part, hyphen, optional newline, and another word part.
    # Works for end-of-line hyphens and mid-line hyphens.
    # Simple version:
    processed_text = re.sub(r'(\w+)-\s*\n\s*(\w+)', r'\1\2', processed_text) # Across newlines
    processed_text = re.sub(r'(\w+)-(\w+)', r'\1\2', processed_text) # Within the same line (after newline removal)
    # This might be too aggressive for words that *should* be hyphenated.
    # A more sophisticated approach would use a dictionary or language model,
    # but for general de-hyphenation in extraction, this is a common first pass.
    logger.debug("Applied de-hyphenation.")

    # 2. Integrate Tables as Markdown
    if tables_data:
        table_markdown_parts: List[str] = []
        for i, table_obj in enumerate(tables_data):
            table_header = f"\n\n[START OF TABLE {i+1}]\n"
            table_footer = f"\n[END OF TABLE {i+1}]\n"
            table_md_content = ""

            if isinstance(table_obj, pd.DataFrame):
                try:
                    # Convert DataFrame to Markdown. `tabulate_kwargs` can be used for better formatting if needed.
                    table_md_content = table_obj.to_markdown(index=False)
                    logger.debug(f"Converted DataFrame table {i+1} to Markdown.")
                except Exception as e:
                    logger.warning(f"Could not convert DataFrame table {i+1} to markdown: {e}. Using string representation.")
                    table_md_content = str(table_obj) # Fallback
            elif isinstance(table_obj, list): # Raw list of lists (e.g., from pdfplumber)
                try:
                    if table_obj and all(isinstance(row, list) for row in table_obj):
                        # Attempt to format as a simple markdown table
                        if not table_obj[0]: # Empty header or table
                             table_md_content = "[Empty Table]"
                        else:
                            header = table_obj[0]
                            data_rows = table_obj[1:]
                            table_md_content = "| " + " | ".join(map(str, header)) + " |\n"
                            table_md_content += "| " + " | ".join(["---"] * len(header)) + " |\n"
                            for row in data_rows:
                                if len(row) == len(header): # Ensure row matches header length
                                    table_md_content += "| " + " | ".join(map(str, row)) + " |\n"
                                else:
                                    logger.warning(f"Skipping malformed row in table {i+1}: {row}")
                            logger.debug(f"Formatted list-based table {i+1} to Markdown.")
                    else: # Not a list of lists, or malformed
                        logger.warning(f"Table {i+1} is a list but not in expected list-of-lists format. Using string representation.")
                        table_md_content = str(table_obj)
                except Exception as e:
                    logger.warning(f"Could not format list-based table {i+1} to markdown: {e}. Using string representation.")
                    table_md_content = str(table_obj) # Fallback
            else: # Unknown table object type
                logger.warning(f"Unknown table type for table {i+1}: {type(table_obj)}. Using string representation.")
                table_md_content = str(table_obj) # Fallback

            table_markdown_parts.append(table_header + table_md_content + table_footer)
        
        # Append all table Markdown representations at the end of the document text.
        # This is a simple strategy. More advanced methods might try to infer original table positions.
        if table_markdown_parts:
            processed_text += "\n\n" + "\n\n".join(table_markdown_parts)
            logger.info(f"Appended {len(table_markdown_parts)} tables as Markdown to the text.")

    # Normalize whitespace again after potential additions and de-hyphenation
    processed_text = re.sub(r'\s+', ' ', processed_text).strip()
    
    logger.info(f"Layout reconstruction complete. Final text length: {len(processed_text)}")
    return processed_text


# --- Stage 5: Metadata Extraction ---
def extract_document_metadata_info(
    file_path: str,
    processed_text: str, # Text after cleaning and table integration
    file_type_from_extraction: str, # Original detected file type (e.g., '.pdf')
    original_file_name: str,
    user_id: str
) -> Dict[str, Any]:
    """
    Extracts standard and content-based metadata from the document.
    Ensures output aligns with the chunk metadata structure.
    """
    logger.info(f"Starting metadata extraction for: {original_file_name} (User: {user_id})")
    
    doc_metadata: Dict[str, Any] = {
        # Initialize with defaults or values passed in
        'file_name': original_file_name,
        'file_path_on_server': file_path, # Storing the server path for internal reference
        'original_file_type': file_type_from_extraction, # The extension detected
        'processing_user': user_id,
        'title': original_file_name, # Default title to filename, can be overwritten by doc properties
        'author': "Unknown",
        'creation_date': None, # Placeholder, specific extraction below
        'modification_date': None, # Placeholder
        'page_count': 0, # Default, will be updated
        'char_count_processed_text': len(processed_text),
        'named_entities': {}, # To be populated by NER
        'structural_elements': "Paragraphs, Tables (inferred)", # General placeholder
        'is_scanned_pdf': False # This will be updated by the orchestrator from Stage 1's output
    }

    # 1. File System Metadata
    try:
        doc_metadata['file_size_bytes'] = os.path.getsize(file_path)
        # Using ISO format for dates is often more standard than epoch for JSON
        doc_metadata['creation_date_os'] = pd.Timestamp(os.path.getctime(file_path), unit='s').isoformat()
        doc_metadata['modification_date_os'] = pd.Timestamp(os.path.getmtime(file_path), unit='s').isoformat()
    except FileNotFoundError:
        logger.error(f"Metadata: File not found during size/time extraction: {file_path}")
    except Exception as e:
        logger.warning(f"Metadata: Could not get file system metadata for {file_path}: {e}")

    # 2. Document-Specific Metadata (Title, Author, Page Count, Creation Date from doc)
    page_count_from_doc = 0
    if file_type_from_extraction == '.pdf':
        try:
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                doc_info = reader.metadata
                if doc_info:
                    # PyPDF2 often returns PdfObject which needs casting or .get()
                    title = doc_info.get('/Title')
                    author = doc_info.get('/Author')
                    creation_raw = doc_info.get('/CreationDate')

                    if title and isinstance(title, str):
                        doc_metadata['title'] = title.strip()
                    if author and isinstance(author, str):
                        doc_metadata['author'] = author.strip()
                    
                    # PDF CreationDate is often like "D:YYYYMMDDHHMMSSOHH'mm'"
                    if creation_raw and isinstance(creation_raw, str) and creation_raw.startswith("D:"):
                        try:
                            # Attempt to parse D:YYYYMMDDHHMMSS format part
                            # Example: D:20230101100000Z or D:20230101100000+05'30'
                            date_str = creation_raw[2:16] # YYYYMMDDHHMMSS
                            # More robust parsing might be needed for timezones
                            dt_obj = pd.to_datetime(date_str, format='%Y%m%d%H%M%S', errors='coerce')
                            if pd.notna(dt_obj):
                                doc_metadata['creation_date'] = dt_obj.isoformat() + ("Z" if creation_raw.endswith("Z") else "") # Add Z if present
                        except ValueError:
                            logger.warning(f"Could not parse PDF CreationDate format: {creation_raw}")
                            doc_metadata['creation_date'] = creation_raw # Store raw if parsing fails

                page_count_from_doc = len(reader.pages)
                doc_metadata['page_count'] = page_count_from_doc
        except Exception as e:
            logger.warning(f"Metadata: Error extracting PDF-specific metadata (PyPDF2) for {file_base_name}: {e}")

    elif file_type_from_extraction == '.docx' and DOCX_AVAILABLE:
        try:
            doc = DocxDocument(file_path)
            if doc.core_properties.title:
                doc_metadata['title'] = doc.core_properties.title
            if doc.core_properties.author:
                doc_metadata['author'] = doc.core_properties.author
            if doc.core_properties.created:
                 doc_metadata['creation_date'] = doc.core_properties.created.isoformat()
            # Page count is not directly available in python-docx. Using paragraph count as a rough indicator.
            page_count_from_doc = sum(1 for _ in doc.paragraphs if _.text.strip()) # Count non-empty paragraphs
            doc_metadata['page_count'] = page_count_from_doc if page_count_from_doc > 0 else 1 # Ensure at least 1
        except Exception as e:
            logger.warning(f"Metadata: Error extracting DOCX-specific metadata for {file_base_name}: {e}")

    elif file_type_from_extraction == '.pptx' and PPTX_AVAILABLE:
        try:
            prs = Presentation(file_path)
            if prs.core_properties.title:
                doc_metadata['title'] = prs.core_properties.title
            if prs.core_properties.author:
                doc_metadata['author'] = prs.core_properties.author
            if prs.core_properties.created:
                 doc_metadata['creation_date'] = prs.core_properties.created.isoformat()
            page_count_from_doc = len(prs.slides)
            doc_metadata['page_count'] = page_count_from_doc
        except Exception as e:
            logger.warning(f"Metadata: Error extracting PPTX-specific metadata for {file_base_name}: {e}")
    
    # Fallback for page count if not set by specific parsers
    if doc_metadata['page_count'] == 0 and processed_text:
        # Approx by double newlines for "pages" in plain text or if above failed
        doc_metadata['page_count'] = processed_text.count('\n\n') + 1 

    # 3. Content-Based Metadata (SpaCy NER)
    # nlp_spacy_core should be the globally loaded SpaCy model
    if processed_text and nlp_spacy_core:
        logger.info(f"Extracting named entities using SpaCy for {original_file_name}...")
        try:
            # Limit NER processing length for very large documents to manage performance
            text_for_ner = processed_text[:config.MAX_TEXT_LENGTH_FOR_NER] if hasattr(config, 'MAX_TEXT_LENGTH_FOR_NER') else processed_text[:500000] # Default limit
            
            spacy_doc = nlp_spacy_core(text_for_ner)
            
            # Initialize entities dict with all possible NER labels from the model to ensure structure
            # even if some entity types are not found in this specific document.
            # Use .get("ner", []) to safely access NER labels.
            ner_labels = nlp_spacy_core.pipe_labels.get("ner", [])
            extracted_entities: Dict[str, List[str]] = {label: [] for label in ner_labels}

            for ent in spacy_doc.ents:
                # Ensure the label exists in our dict (should always be true if initialized with pipe_labels)
                if ent.label_ in extracted_entities:
                    extracted_entities[ent.label_].append(ent.text)
                else: # Should not happen if ner_labels is comprehensive
                    extracted_entities[ent.label_] = [ent.text]
            
            # Only include entity types that actually have entities found
            doc_metadata['named_entities'] = {k: list(set(v)) for k, v in extracted_entities.items() if v} # list(set(v)) to keep unique entities
            
            num_total_entities = sum(len(v_list) for v_list in doc_metadata['named_entities'].values())
            logger.info(f"Extracted {num_total_entities} unique named entities for {original_file_name}.")
        except Exception as e:
            logger.error(f"Metadata: Error during spaCy NER processing for {original_file_name}: {e}", exc_info=True)
            doc_metadata['named_entities'] = {} # Ensure it's a dict even on error
    else:
        logger.info(f"Skipping NER for {original_file_name} (no text or nlp_spacy_core not available).")
        doc_metadata['named_entities'] = {}

    # Ensure specific keys from your sample output are present in the final metadata
    # (Some of these might have been set above, this is a final check/defaulting)
    final_metadata_for_chunks = {
        'title': doc_metadata.get('title', original_file_name),
        'author': doc_metadata.get('author', "Unknown"),
        'creation_date': doc_metadata.get('creation_date'), # Already set or None
        'file_name': original_file_name, # Already set
        'page_count': doc_metadata.get('page_count', 0), # Already set
        'named_entities': doc_metadata.get('named_entities', {}), # Already set
        'structural_elements': doc_metadata.get('structural_elements', "Paragraphs, Tables (inferred)"), # Default
        # Include other potentially useful document-level metadata for chunks
        'original_file_type': doc_metadata.get('original_file_type'),
        'processing_user': user_id,
        'file_path_on_server': file_path, # Internal use mostly
        'is_scanned_pdf': False # This should be set by the orchestrator using Stage 1 output
    }
    
    logger.info(f"Metadata extraction complete for {original_file_name}.")
    return final_metadata_for_chunks # This dict will be the base for each chunk's metadata


# --- Stage 6: Text Chunking ---
def chunk_document_into_segments(
    text_to_chunk: str,
    document_level_metadata: Dict[str, Any] # Base metadata for all chunks from this doc
) -> List[Dict[str, Any]]: # List of chunk dicts
    """
    Divides text into manageable chunks using RecursiveCharacterTextSplitter.
    Each chunk will inherit and augment document-level metadata.
    Uses CHUNK_SIZE and CHUNK_OVERLAP from rag_service.config.
    """
    if not text_to_chunk or not text_to_chunk.strip():
        logger.warning(f"Chunking: No text provided for chunking (file: {document_level_metadata.get('file_name', 'unknown')}). Skipping chunking.")
        return []

    # Use CHUNK_SIZE and CHUNK_OVERLAP from rag_service.config
    # Ensure 'config' is imported at the top of ai_core.py: from rag_service import config
    chunk_s = config.CHUNK_SIZE
    chunk_o = config.CHUNK_OVERLAP

    logger.info(f"Starting text chunking for {document_level_metadata.get('file_name', 'unknown')}. "
                f"Using config: CHUNK_SIZE={chunk_s}, CHUNK_OVERLAP={chunk_o}")
    
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_s,
        chunk_overlap=chunk_o,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""], # Prioritize semantic breaks
        keep_separator=True 
    )

    try:
        # Split the text content into segments
        raw_text_segments: List[str] = text_splitter.split_text(text_to_chunk)
    except Exception as e:
        logger.error(f"Chunking: Error splitting text for {document_level_metadata.get('file_name', 'unknown')}: {e}", exc_info=True)
        return []
        
    output_chunks: List[Dict[str, Any]] = []
    # Use original_file_name from the document_level_metadata for a consistent prefix
    # Ensure 'file_name' is present in document_level_metadata (it should be from Stage 5)
    base_file_name = document_level_metadata.get('file_name', 'unknown_document')
    file_name_prefix = os.path.splitext(base_file_name)[0]

    for i, text_segment_content in enumerate(raw_text_segments):
        if not text_segment_content.strip(): # Skip empty chunks that might result from splitting
            logger.debug(f"Skipping empty chunk at index {i} for {base_file_name}.")
            continue

        # Create a deep copy of the document-level metadata for this chunk to avoid aliasing issues
        # This is important if document_level_metadata contains mutable types like lists/dicts (e.g., named_entities)
        import copy
        chunk_specific_metadata = copy.deepcopy(document_level_metadata)

        # Add chunk-specific details
        chunk_id = f"{file_name_prefix}_chunk_{i:04d}" # Padded for consistent sorting
        chunk_specific_metadata['chunk_id'] = chunk_id
        chunk_specific_metadata['chunk_index'] = i
        chunk_specific_metadata['chunk_char_count'] = len(text_segment_content)
        
        # The chunk_specific_metadata now contains all document-level info + chunk-specific info,
        # aligning with your sample output structure.

        output_chunks.append({
            'id': chunk_id, # Top-level 'id' for the chunk, as per your sample
            'text_content': text_segment_content,
            'metadata': chunk_specific_metadata # The comprehensive metadata for this chunk
        })
    
    logger.info(f"Chunking: Split '{base_file_name}' into {len(output_chunks)} non-empty chunks.")
    return output_chunks


# --- Stage 7: Embedding Generation ---
def generate_segment_embeddings(
    document_chunks: List[Dict[str, Any]] # List of chunk dicts from Stage 6
) -> List[Dict[str, Any]]: # List of chunk dicts, now with 'embedding_vector'
    """
    Generates vector embeddings for the 'text_content' of each chunk
    using the globally loaded 'document_embedding_model' (from config.py).
    Adds 'embedding_vector' (as a list of floats) to each chunk dictionary.
    """
    if not document_chunks:
        logger.info("Embedding: No document chunks provided for embedding generation.")
        return []

    # The document_embedding_model is already loaded globally in ai_core.py
    # using config.EMBEDDING_MODEL_NAME
    logger.info(f"Embedding: Starting embedding generation for {len(document_chunks)} chunks "
                f"using model: {config.EMBEDDING_MODEL_NAME}.") # Log which model is being used
    
    texts_to_embed: List[str] = []
    indices_of_chunks_with_text: List[int] = []

    for i, chunk_dict in enumerate(document_chunks):
        text_content = chunk_dict.get('text_content')
        if text_content and text_content.strip():
            texts_to_embed.append(text_content)
            indices_of_chunks_with_text.append(i)
        else:
            # Handle chunks with no text_content: assign None or empty list to 'embedding_vector'
            chunk_dict['embedding_vector'] = None 
            logger.debug(f"Embedding: Chunk {chunk_dict.get('id', i)} has no text content, skipping embedding for it.")

    if not texts_to_embed:
        logger.warning("Embedding: No actual text content found in any provided chunks to generate embeddings.")
        return document_chunks # All relevant chunks would have 'embedding_vector': None

    try:
        # Generate embeddings in batch for all valid text segments
        logger.info(f"Embedding: Generating embeddings for {len(texts_to_embed)} non-empty text segments...")
        
        # Using the globally loaded model: document_embedding_model
        # This model was initialized with SentenceTransformer(config.EMBEDDING_MODEL_NAME)
        embeddings_np_array = document_embedding_model.encode(
            texts_to_embed,
            show_progress_bar=False, # Good for server logs
            # normalize_embeddings=True # Often recommended for cosine similarity.
                                       # Set this based on how your chosen model (e.g., mixedbread) expects to be used
                                       # or if your downstream vector DB benefits from normalized embeddings.
                                       # mixedbread-ai/mxbai-embed-large-v1 typically benefits from normalization.
        )
        
        # Assign embeddings back to the corresponding original chunks
        for i, original_chunk_index in enumerate(indices_of_chunks_with_text):
            if i < len(embeddings_np_array):
                # Convert numpy array to list of floats for JSON serialization
                document_chunks[original_chunk_index]['embedding_vector'] = embeddings_np_array[i].tolist()
            else:
                logger.error(f"Embedding: Mismatch in embedding count for chunk at original index {original_chunk_index}. Assigning None.")
                document_chunks[original_chunk_index]['embedding_vector'] = None
        
        logger.info(f"Embedding: Embeddings generated and assigned to {len(indices_of_chunks_with_text)} chunks.")
        
    except Exception as e:
        logger.error(f"Embedding: Error during embedding generation with model {config.EMBEDDING_MODEL_NAME}: {e}", exc_info=True)
        # If embedding fails globally, mark all relevant chunks as having no embedding
        for original_chunk_index in indices_of_chunks_with_text:
            document_chunks[original_chunk_index]['embedding_vector'] = None
        # Depending on how critical embeddings are, you might re-raise
        # raise
        
    return document_chunks



# --- Main Orchestration Function (to be called by app.py) ---
def process_document_for_embeddings(file_path: str, original_name: str, user_id: str) -> List[Dict[str, Any]]:
    """
    Orchestrates the full document processing pipeline from file path to
    a list of chunks with text, metadata, and embeddings.
    """
    logger.info(f"ai_core: Orchestrating document processing for {original_name}, user {user_id}")
    if not os.path.exists(file_path):
        logger.error(f"File not found at ai_core entry point: {file_path}")
        # Consider how to propagate this: raise error or return empty list/error status
        # For now, we'll let app.py handle the initial file check,
        # but good to have a fallback if called directly.
        raise FileNotFoundError(f"File not found: {file_path}")

    try:
        # Step 1: Extract Raw Content
        raw_content = extract_raw_content_from_file(file_path)
        # Example of how to access: raw_content['text_content'], raw_content['images'], etc.
        # file_type will be important: raw_content['file_type']
        # is_scanned will be important: raw_content['is_scanned']

        # Step 2: Perform OCR if needed
        ocr_text_output = ""
        if raw_content.get('is_scanned') and raw_content.get('images'):
            ocr_text_output = perform_ocr_on_images(raw_content['images'])

        # Combine initial text and OCR text
        combined_text = raw_content.get('text_content', "")
        if ocr_text_output:
            # Smart combination logic here (e.g., if OCR text is substantial, prioritize it)
            if raw_content.get('is_scanned') and len(ocr_text_output) > len(combined_text) / 2:
                 combined_text = ocr_text_output + "\n\n" + combined_text
            else:
                 combined_text += "\n\n" + ocr_text_output
        
        if not combined_text.strip() and not raw_content.get('tables'):
            logger.warning(f"No text content for {original_name} after raw extraction and OCR, and no tables found. Returning empty.")
            return []

        # Step 3: Clean and Normalize Text
        cleaned_text = clean_and_normalize_text_content(combined_text)
        if not cleaned_text.strip() and not raw_content.get('tables'):
            logger.warning(f"No meaningful text for {original_name} after cleaning, and no tables. Returning empty.")
            return []


        # Step 4: Reconstruct Layout and Integrate Tables
        text_for_metadata_and_chunking = reconstruct_document_layout(
            cleaned_text,
            raw_content.get('tables', []),
            raw_content.get('file_type', '')
        )

        # Step 5: Extract Document-Level Metadata
        doc_metadata = extract_document_metadata_info(
            file_path,
            text_for_metadata_and_chunking, # Use the most complete text
            raw_content.get('file_type', ''),
            original_name,
            user_id
        )
        # Augment doc_metadata with is_scanned status
        doc_metadata['is_scanned_pdf'] = raw_content.get('is_scanned', False)


        # Step 6: Chunk Text
        # Pass the comprehensive doc_metadata to be the base for each chunk's metadata
        chunks_with_metadata = chunk_document_into_segments(
            text_for_metadata_and_chunking,
            doc_metadata
        )
        if not chunks_with_metadata:
            logger.warning(f"No chunks produced for {original_name}. Returning empty list.")
            return []

        # Step 7: Generate Embeddings
        final_chunks_with_embeddings = generate_segment_embeddings(chunks_with_metadata)
        
        logger.info(f"ai_core: Successfully processed {original_name}. Generated {len(final_chunks_with_embeddings)} chunks.")
        return final_chunks_with_embeddings

    except pytesseract.TesseractNotFoundError:
        logger.critical("ai_core: Tesseract (OCR engine) not found. Processing aborted.")
        raise # Re-raise to be caught by app.py
    except Exception as e:
        logger.error(f"ai_core: Critical error during processing of {original_name}: {e}", exc_info=True)
        raise # Re-raise to be caught by app.py