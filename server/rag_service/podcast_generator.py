<<<<<<< HEAD
# server/rag_service/podcast_generator.py
import logging
import os
import re
import uuid
import subprocess
from gtts import gTTS
import io

logger = logging.getLogger(__name__)

# --- UPDATED AND MORE DIRECT PROMPT ---
=======

# server/rag_service/podcast_generator.py
import logging
import re
from gtts import gTTS

logger = logging.getLogger(__name__)

>>>>>>> origin/skms
PODCAST_SCRIPT_PROMPT_TEMPLATE = """
You are an AI podcast script generator. Your SOLE task is to generate a realistic, two-speaker educational dialogue based on the provided text. The script should be substantial, aiming for a length of at least 600-800 words to ensure a meaningful discussion.

**CRITICAL INSTRUCTION:** Your entire output must be ONLY the script itself. Start directly with "SPEAKER_A:". Do NOT include any preamble, introduction, or metadata like "Here is the script:".

---
## Podcast Style Guide
<<<<<<< HEAD

- **Format**: Two-speaker conversational podcast.
- **SPEAKER_A**: The "Curious Learner". Asks clarifying questions, follow-up questions, and represents the student's perspective. Their role is to drive the conversation deeper.
- **SPEAKER_B**: The "Expert Teacher". Provides clear, detailed explanations and examples based on the document text.
- **Dialogue Flow**: The conversation must be a natural back-and-forth. SPEAKER_A asks a question, SPEAKER_B gives a detailed answer, and SPEAKER_A should follow up with another question that logically flows from the answer. Create at least 5-7 such exchanges.

---
## Script Structure

### 1. Opening
The script must begin with a brief, engaging conversation to set the stage.
`SPEAKER_A: Hey, I was just reading this document about {study_focus}, and I'm a bit stuck on a few things. Can we talk through it?`
`SPEAKER_B: Absolutely! I'd be happy to. What's on your mind first?`

### 2. Main Body
The main part of the script should be a detailed question-and-answer dialogue driven by SPEAKER_A, covering the key points of the `STUDY FOCUS`. Use the `DOCUMENT TEXT` to formulate SPEAKER_B's expert answers. Ensure the conversation flows logically from one point to the next.

### 3. Closing
Conclude the podcast with a quick summary and an encouraging sign-off.
`SPEAKER_A: This makes so much more sense now. Thanks for breaking that all down for me!`
`SPEAKER_B: You're welcome! The key is to explore these topics step-by-step. Keep up the great work!`

---
## Source Material

**STUDY FOCUS (The main topic for the podcast):**
{study_focus}

**DOCUMENT TEXT (Use this for all factual answers):**
{document_content}

---
**FINAL SCRIPT OUTPUT (Remember: Start IMMEDIATELY with "SPEAKER_A:" and aim for a 600-800 word script):**
"""


def generate_podcast_script(source_document_text, outline_content, llm_function):
    """
    Generates a two-speaker podcast script using the LLM.
    """
    logger.info("Generating two-speaker podcast script with updated prompt...")
    
    prompt = PODCAST_SCRIPT_PROMPT_TEMPLATE.format(
        document_content=source_document_text[:40000], # Limit context to avoid excessive token usage
=======
- **Format**: Two-speaker conversational podcast.
- **SPEAKER_A**: The "Curious Learner". Asks clarifying questions and drives the conversation.
- **SPEAKER_B**: The "Expert Teacher". Provides clear, detailed explanations based on the document.
- **Dialogue Flow**: Natural back-and-forth. Create at least 5-7 exchanges.

---
## Task-Specific Instructions
- **Podcast Purpose**: {purpose_instruction}
- **Podcast Length**: {length_instruction}

---
## Source Material
**STUDY FOCUS (The main topic for the podcast):**
{study_focus}
**DOCUMENT TEXT (Use this for all factual answers):**
{document_content}
---
**FINAL SCRIPT OUTPUT (Remember: Start IMMEDIATELY with "SPEAKER_A:"):**
"""

def generate_podcast_script(source_document_text, outline_content, podcast_options, llm_function):
    """Generates a two-speaker podcast script using the LLM with dynamic options."""
    logger.info(f"Generating podcast script with options: {podcast_options}")

    purpose_map = {
        'introduction': "Focus on high-level concepts and definitions. Assume the listener is new to the topic. Keep explanations simple and clear.",
        'exam_prep': "Focus on key facts, data, and potential test questions. The dialogue should be structured like a Q&A review session, covering the most important material for an exam.",
        'deep_dive': "Explore the topic in great detail. Discuss nuances, complexities, and specific examples from the text. Assume the listener has some prior knowledge.",
        'review': "Provide a balanced overview of the main topics. Cover the most important points without getting lost in minor details. This is for general understanding."
    }
    
    length_map = {
        'quick': "The script should be concise, resulting in approximately 5-7 minutes of spoken audio. Aim for around 800-1000 words.",
        'standard': "The script should be of a standard length, resulting in approximately 10-15 minutes of spoken audio. Aim for around 1500-2000 words.",
        'comprehensive': "The script should be very detailed and long, resulting in approximately 15-25 minutes of spoken audio. Aim for over 2500 words."
    }

    purpose_instruction = purpose_map.get(podcast_options.get('studyPurpose'), purpose_map['review'])
    length_instruction = length_map.get(podcast_options.get('sessionLength'), length_map['standard'])

    prompt = PODCAST_SCRIPT_PROMPT_TEMPLATE.format(
        purpose_instruction=purpose_instruction,
        length_instruction=length_instruction,
        document_content=source_document_text[:60000],
>>>>>>> origin/skms
        study_focus=outline_content,
    )
    
    script = llm_function(prompt)
    if not script or not script.strip():
        raise ValueError("LLM failed to generate a podcast script.")
<<<<<<< HEAD
    
    logger.info(f"LLM generated two-speaker podcast script. Length: {len(script)}")
    return script

def parse_script_into_dialogue(script_text):
    """Parses the script text into a list of (speaker, text) tuples."""
    dialogue = []
    lines = script_text.split('\n')
    current_speaker = None
    current_text = ""

    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        match = re.match(r'^(SPEAKER_[AB]):(.*)', line, re.IGNORECASE)
        if match:
            if current_speaker and current_text:
                dialogue.append((current_speaker, current_text.strip()))
            
            current_speaker = match.group(1).upper()
            current_text = match.group(2).strip()
        elif current_speaker:
            current_text += " " + line
            
    if current_speaker and current_text:
        dialogue.append((current_speaker, current_text.strip()))
        
    return dialogue

def synthesize_dual_speaker_audio(dialogue, output_path):
    """
    Creates a two-speaker audio file using gTTS and FFmpeg subprocess.
    """
    logger.info(f"Synthesizing dual-speaker audio for {len(dialogue)} parts using FFmpeg.")
    
    temp_dir = os.path.dirname(output_path)
    session_id = str(uuid.uuid4())
    temp_files = []
    ffmpeg_playlist_path = os.path.join(temp_dir, f"playlist_{session_id}.txt")

    tts_voices = {
        'SPEAKER_A': {'lang': 'en', 'tld': 'co.uk'},
        'SPEAKER_B': {'lang': 'en', 'tld': 'com'}
    }

    try:
        for i, (speaker, text) in enumerate(dialogue):
            if not text:
                continue
            
            try:
                temp_filename = os.path.join(temp_dir, f"temp_{session_id}_{i:03d}.mp3")
                voice_params = tts_voices.get(speaker, tts_voices['SPEAKER_A'])
                clean_text = text.replace('*', '').replace('[PAUSE]', '...')

                tts = gTTS(text=clean_text, lang=voice_params['lang'], tld=voice_params['tld'], slow=False)
                tts.save(temp_filename)
                
                silence_filename = os.path.join(temp_dir, f"silence_{session_id}_{i:03d}.mp3")
                subprocess.run(
                    ['ffmpeg', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.7', '-q:a', '9', '-acodec', 'libmp3lame', silence_filename],
                    check=True, capture_output=True, text=True
                )

                temp_files.append(temp_filename)
                temp_files.append(silence_filename)

            except Exception as e:
                logger.warning(f"Skipping dialogue part due to gTTS/ffmpeg silence error: {e}. Text: '{text[:50]}...'")

        if not temp_files:
            raise ValueError("No audio segments were successfully generated.")

        with open(ffmpeg_playlist_path, 'w') as f:
            for temp_file in temp_files:
                escaped_path = temp_file.replace('\\', '/').replace("'", "'\\''")
                f.write(f"file '{escaped_path}'\n")
        
        temp_files.append(ffmpeg_playlist_path)

        logger.info(f"Concatenating {len(temp_files)-1} audio segments into final podcast file.")
        ffmpeg_command = [
            'ffmpeg', '-f', 'concat', '-safe', '0', '-i', ffmpeg_playlist_path, '-c', 'copy', output_path
        ]
        
        subprocess.run(ffmpeg_command, check=True, capture_output=True, text=True)
        
        return True

    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg command failed with exit code {e.returncode}\nFFmpeg stderr: {e.stderr}")
        raise IOError(f"FFmpeg failed during audio processing: {e.stderr}") from e
    except Exception as e:
        logger.error(f"An unexpected error occurred during audio synthesis: {e}", exc_info=True)
        raise
    finally:
        logger.info(f"Cleaning up {len(temp_files)} temporary files...")
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except OSError as e_remove:
                logger.error(f"Error removing temporary file {temp_file}: {e_remove}")
=======
    logger.info(f"LLM generated podcast script. Length: {len(script)}")
    return script

def synthesize_audio_with_gtts(text: str, output_path: str):
    """
    Synthesizes audio from text using the gTTS library and saves it as an MP3.
    """
    logger.info(f"Synthesizing audio with gTTS for text of length {len(text)}...")
    
    clean_text = re.sub(r'SPEAKER_[AB]:', '', text).replace('*', '').replace('#', '').strip()
    
    try:
        tts = gTTS(text=clean_text, lang='en', slow=False)
        tts.save(output_path)
        logger.info(f"gTTS audio saved successfully to {output_path}")
    except Exception as e:
        logger.error(f"gTTS failed during synthesis: {e}", exc_info=True)
        raise IOError("Text-to-Speech synthesis with gTTS failed.") from e
>>>>>>> origin/skms
