# server/rag_service/media_processor.py
import os
import tempfile
import shutil
import logging
from typing import Optional

# --- Tool Imports ---
try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

# --- THIS IS THE NEW IMPORT ---
try:
    import ffmpeg
    FFMPEG_PYTHON_AVAILABLE = True
except ImportError:
    FFMPEG_PYTHON_AVAILABLE = False

try:
    from PIL import Image
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False

import config

logger = logging.getLogger(__name__)

if PYTESSERACT_AVAILABLE and config.TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_CMD

def process_uploaded_audio(file_path: str) -> Optional[str]:
    """Transcribes audio content from a given file path."""
    if not WHISPER_AVAILABLE:
        raise ImportError("Audio processing requires 'openai-whisper'.")
    
    logger.info(f"Transcribing audio file: {os.path.basename(file_path)}")
    try:
        model = whisper.load_model("base")
        result = model.transcribe(file_path, fp16=False)
        transcribed_text = result['text']
        logger.info(f"Transcription complete for audio file. Text length: {len(transcribed_text)}")
        return transcribed_text
    except Exception as e:
        logger.error(f"Whisper error processing audio file {file_path}: {e}")
        raise IOError(f"Failed to transcribe audio file: {e}")

# --- THIS FUNCTION IS RE-ENGINEERED ---
def process_uploaded_video(file_path: str) -> Optional[str]:
    """Extracts audio from a video file and transcribes it using ffmpeg-python."""
    if not FFMPEG_PYTHON_AVAILABLE:
        raise ImportError("Video processing requires 'ffmpeg-python'.")

    logger.info(f"Processing video file for audio extraction: {os.path.basename(file_path)}")
    temp_dir = tempfile.mkdtemp()
    # Use .wav format for high compatibility with whisper
    temp_audio_path = os.path.join(temp_dir, "extracted_audio.wav")
    try:
        # Use ffmpeg-python to create and run the command
        # This is equivalent to: ffmpeg -i "input_video.mp4" -vn -acodec pcm_s16le -ar 16000 -ac 1 "output_audio.wav"
        (
            ffmpeg
            .input(file_path)
            .output(
                temp_audio_path,
                acodec='pcm_s16le', # Use WAV codec
                ar=16000,          # Set audio rate to 16kHz (recommended for whisper)
                ac=1               # Set to mono audio
            )
            .run(cmd=['ffmpeg', '-nostdin'], capture_stdout=True, capture_stderr=True, quiet=True)
        )
        
        logger.info(f"Audio extracted to temporary file. Now transcribing.")
        return process_uploaded_audio(temp_audio_path)
    except ffmpeg.Error as e:
        # This will capture errors from the ffmpeg command itself
        logger.error(f"FFmpeg error processing video file {file_path}:")
        # The error output from the command is in stderr
        logger.error(e.stderr.decode())
        raise IOError(f"Failed to extract audio from video using FFmpeg.")
    except Exception as e:
        logger.error(f"General error processing video file {file_path}: {e}")
        raise IOError(f"An unexpected error occurred during video processing: {e}")
    finally:
        shutil.rmtree(temp_dir)
# --- END OF RE-ENGINEERED FUNCTION ---

def process_uploaded_image(file_path: str) -> Optional[str]:
    """Performs OCR on an image file to extract text."""
    if not PYTESSERACT_AVAILABLE:
        raise ImportError("Image processing requires 'pytesseract' and 'Pillow'.")
    
    logger.info(f"Performing OCR on image file: {os.path.basename(file_path)}")
    try:
        img = Image.open(file_path)
        processed_img = img.convert('L')
        text = pytesseract.image_to_string(processed_img)
        logger.info(f"OCR complete for image file. Text length: {len(text)}")
        return text
    except pytesseract.TesseractNotFoundError:
        logger.critical("Tesseract executable not found or not configured correctly in config.py.")
        raise
    except Exception as e:
        logger.error(f"Pytesseract error processing image file {file_path}: {e}")
        raise IOError(f"Failed to perform OCR on image: {e}")