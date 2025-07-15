
# server/rag_service/podcast_generator.py
import logging
import re
from gtts import gTTS

logger = logging.getLogger(__name__)

PODCAST_SCRIPT_PROMPT_TEMPLATE = """
You are an AI podcast script generator. Your SOLE task is to generate a realistic, two-speaker educational dialogue based on the provided text. The script should be substantial, aiming for a length of at least 600-800 words to ensure a meaningful discussion.

**CRITICAL INSTRUCTION:** Your entire output must be ONLY the script itself. Start directly with "SPEAKER_A:". Do NOT include any preamble, introduction, or metadata like "Here is the script:".

---
## Podcast Style Guide
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
        study_focus=outline_content,
    )
    
    script = llm_function(prompt)
    if not script or not script.strip():
        raise ValueError("LLM failed to generate a podcast script.")
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
