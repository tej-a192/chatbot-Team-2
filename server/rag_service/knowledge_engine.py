# server/rag_service/knowledge_engine.py
import os
import re
import tempfile
import shutil
import logging
from typing import Tuple, Optional

# --- Tool Imports ---
try:
    import yt_dlp
    YTDLP_AVAILABLE = True
except ImportError:
    YTDLP_AVAILABLE = False

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False

logger = logging.getLogger(__name__)

# --- YouTube Processing ---
def _extract_youtube_text(url: str) -> Tuple[Optional[str], Optional[str]]:
    if not YTDLP_AVAILABLE or not WHISPER_AVAILABLE:
        raise ImportError("YouTube processing requires 'yt-dlp' and 'openai-whisper'.")
    
    logger.info(f"Processing YouTube URL: {url}")
    temp_dir = tempfile.mkdtemp()
    try:
        ydl_opts = {
            'format': 'm4a/bestaudio/best',
            'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'),
            'noplaylist': True,
            'quiet': True,
            'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'wav'}],
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info_dict = ydl.extract_info(url, download=True)
            video_title = info_dict.get('title', 'YouTube Video')
            # yt-dlp might change the extension, find the resulting file
            base_filename = ydl.prepare_filename(info_dict)
            audio_file_path = os.path.splitext(base_filename)[0] + '.wav'
            
            if not os.path.exists(audio_file_path):
                 # Fallback if ffmpeg didn't produce wav
                 audio_file_path = base_filename

        logger.info(f"Transcribing audio for '{video_title}' with Whisper...")
        model = whisper.load_model("base")
        result = model.transcribe(audio_file_path, fp16=False)
        transcribed_text = result['text']
        
        logger.info(f"Transcription complete for '{video_title}'. Text length: {len(transcribed_text)}")
        return transcribed_text, video_title
    except Exception as e:
        logger.error(f"yt-dlp/whisper error processing URL {url}: {e}")
        raise ConnectionError(f"Failed to process YouTube video: {e}")
    finally:
        shutil.rmtree(temp_dir)

# --- Webpage Content Processing ---
def _extract_webpage_text(url: str) -> Tuple[Optional[str], Optional[str]]:
    if not PLAYWRIGHT_AVAILABLE or not BS4_AVAILABLE:
        raise ImportError("Webpage processing requires 'playwright' and 'beautifulsoup4'.")

    logger.info(f"Processing webpage URL: {url}")
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until='networkidle', timeout=30000)
            
            page_title = page.title() or url
            html_content = page.content()
            browser.close()

            logger.info(f"Successfully fetched content for '{page_title}'")
            
            soup = BeautifulSoup(html_content, "html.parser")
            for element in soup(["script", "style", "nav", "footer", "aside", "header", "form"]):
                element.decompose()
            
            body = soup.find('body')
            if body:
                text = body.get_text(separator='\n', strip=True)
                cleaned_text = re.sub(r'\n{3,}', '\n\n', text)
            else:
                cleaned_text = ""
            
            logger.info(f"Extracted and cleaned text from '{page_title}'. Length: {len(cleaned_text)}")
            return cleaned_text, page_title
        except Exception as e:
            logger.error(f"Playwright/BS4 error processing URL {url}: {e}")
            raise ConnectionError(f"Failed to scrape webpage: {e}")

# --- Main Orchestrator for URLs ---
def process_url_source(url: str, user_id: str) -> Tuple[Optional[str], str, str]:
    """
    Orchestrates processing for any URL, dispatching to the correct handler.
    Returns: (extracted_text, final_title, source_type)
    """
    logger.info(f"Knowledge Engine: Orchestrating URL processing for '{url}'")
    
    raw_text, final_title, source_type = None, url, 'webpage'

    youtube_regex = (
        r'(https?://)?(www\.)?'
        '(youtube|youtu|youtube-nocookie)\.(com|be)/'
        '(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})')
    
    is_youtube = re.match(youtube_regex, url)

    if is_youtube:
        source_type = 'youtube'
        raw_text, final_title = _extract_youtube_text(url)
    else:
        source_type = 'webpage'
        raw_text, final_title = _extract_webpage_text(url)

    if not raw_text:
        return None, final_title, source_type

    cleaned_text = re.sub(r'\s+', ' ', raw_text).strip()
    
    logger.info(f"Successfully processed URL '{url}'. Title: '{final_title}'. Type: '{source_type}'.")
    return cleaned_text, final_title, source_type