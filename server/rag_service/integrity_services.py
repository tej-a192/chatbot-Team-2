# server/rag_service/integrity_services.py
import logging
import requests
import time
import re
import json
from typing import Dict, Any, List
import textstat
import config
from prompts import (
    BIAS_CHECK_PROMPT_TEMPLATE, 
    FACT_CHECK_EXTRACT_PROMPT_TEMPLATE,
    FACT_CHECK_VERIFY_PROMPT_TEMPLATE
)
from academic_search import search_all_apis as academic_search
from ddgs import DDGS

logger = logging.getLogger(__name__)

# In-memory cache for Turnitin token
turnitin_token_cache = { "token": None, "expires_at": 0 }

# --- NEW: Robust JSON Extraction Helper ---
def _extract_json_from_llm_response(text: str) -> Dict[str, Any]:
    """
    Finds and parses a JSON object from a string that might contain other text,
    including markdown code fences.
    """
    # Pattern to find JSON within ```json ... ``` or just ``` ... ```
    json_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text, re.DOTALL)
    if json_match:
        json_string = json_match.group(1)
    else:
        # Fallback to finding the first '{' and the last '}'
        start_index = text.find('{')
        end_index = text.rfind('}')
        if start_index != -1 and end_index != -1 and end_index > start_index:
            json_string = text[start_index:end_index+1]
        else:
            raise ValueError("No valid JSON object found in the LLM response.")
            
    return json.loads(json_string)
# --- END NEW HELPER ---


# --- Plagiarism Service (Turnitin) ---
# ... (get_turnitin_auth_token, submit_to_turnitin, get_turnitin_report functions remain exactly the same) ...
async def get_turnitin_auth_token() -> str:
    """Gets a JWT from Turnitin, using a simple in-memory cache."""
    if turnitin_token_cache["token"] and time.time() < turnitin_token_cache["expires_at"]:
        return turnitin_token_cache["token"]

    if not all([config.TURNITIN_API_URL, config.TURNITIN_API_KEY, config.TURNITIN_API_SECRET]):
        raise ValueError("Turnitin API credentials are not configured on the server.")

    url = f"{config.TURNITIN_API_URL}/oauth/token"
    payload = {
        'grant_type': 'client_credentials',
        'client_id': config.TURNITIN_API_KEY,
        'client_secret': config.TURNITIN_API_SECRET
    }
    headers = {'Content-Type': 'application/x-www-form-urlencoded'}
    
    response = requests.post(url, data=payload, headers=headers)
    response.raise_for_status()
    data = response.json()

    turnitin_token_cache["token"] = data['access_token']
    turnitin_token_cache["expires_at"] = time.time() + data['expires_in'] - 60  # 60s buffer
    return data['access_token']

async def submit_to_turnitin(text: str, filename: str = "pasted_text.txt") -> str:
    """Submits text to Turnitin and returns a submission ID."""
    token = await get_turnitin_auth_token()
    url = f"{config.TURNITIN_API_URL}/submissions"
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    payload = {
        'owner': 'api-user@example.com', # A generic owner identifier
        'title': f"Integrity Check - {filename}",
        'file_content': text
    }

    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    return response.json()['id']

async def get_turnitin_report(submission_id: str) -> Dict[str, Any]:
    """Polls for and returns the final Turnitin similarity report."""
    token = await get_turnitin_auth_token()
    report_url = f"{config.TURNITIN_API_URL}/submissions/{submission_id}/similarity_report"
    headers = {'Authorization': f'Bearer {token}'}

    for _ in range(12):  # Poll for up to 2 minutes (12 * 10s)
        response = requests.get(report_url, headers=headers)
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 202: # Accepted, but not ready
            time.sleep(10)
        else:
            response.raise_for_status()
    raise TimeoutError("Turnitin report generation timed out after 2 minutes.")


# --- Bias & Inclusivity Service ---

def check_bias_hybrid(text: str, llm_function) -> List[Dict[str, str]]:
    """Performs a hybrid check for biased language."""
    from bias_wordlists import INCLUSIVE_LANGUAGE_REPLACEMENTS
    
    findings = []
    # 1. Fast library check
    for term, suggestion in INCLUSIVE_LANGUAGE_REPLACEMENTS.items():
        if re.search(r'\b' + re.escape(term) + r'\b', text, re.IGNORECASE):
            findings.append({
                "text": term, 
                "reason": "This term may have a more inclusive or objective alternative.", 
                "suggestion": suggestion
            })

    # 2. Deep LLM check
    prompt = BIAS_CHECK_PROMPT_TEMPLATE.format(text_to_analyze=text[:30000]) # Limit context
    try:
        response_text = llm_function(prompt)
        # --- THIS IS THE FIX ---
        llm_findings = _extract_json_from_llm_response(response_text).get("findings", [])
        findings.extend(llm_findings)
    except Exception as e:
        logger.error(f"LLM bias check failed: {e}")
        # Optionally, re-raise or handle the error, but don't let it crash
        # For now, we log it and proceed with only the wordlist findings.

    # Deduplicate findings
    unique_findings = {f['text'].lower(): f for f in findings}
    return list(unique_findings.values())


# --- Fact-Checking Service ---
async def check_facts_agentic(text: str, llm_function) -> List[Dict[str, str]]:
    """Performs an agentic workflow to fact-check claims."""
    # 1. Extract Claims
    extract_prompt = FACT_CHECK_EXTRACT_PROMPT_TEMPLATE.format(text_to_analyze=text[:30000]) # Limit context
    try:
        # --- THIS IS THE FIX ---
        extract_response = llm_function(extract_prompt)
        claims = _extract_json_from_llm_response(extract_response).get("claims", [])
    except Exception as e:
        logger.error(f"Fact-check claim extraction failed: {e}")
        return [{"claim": "Error", "status": "Failed", "evidence": "Error during claim extraction."}]

    if not claims: return []

    # 2. Verify each claim
    verified_claims = []
    for claim in claims:
        # 2a. Gather Evidence
        web_results = []
        try:
            with DDGS() as ddgs:
                web_results = list(ddgs.text(claim, max_results=3))
        except Exception as e:
            logger.warning(f"DDGS web search failed for claim '{claim}': {e}")
        
        academic_results = await academic_search(claim, 2)
        
        search_results_text = "WEB RESULTS:\n"
        search_results_text += "\n\n".join([f"[{i+1}] {r['title']}\n{r['body']}" for i, r in enumerate(web_results)])
        search_results_text += "\n\nACADEMIC RESULTS:\n"
        search_results_text += "\n\n".join([f"[A{i+1}] {r['title']}\n{r['summary']}" for i, r in enumerate(academic_results)])

        # 2b. Synthesize & Verify
        verify_prompt = FACT_CHECK_VERIFY_PROMPT_TEMPLATE.format(claim=claim, search_results=search_results_text)
        try:
            # --- THIS IS THE FIX ---
            verify_response = llm_function(verify_prompt)
            synthesis = _extract_json_from_llm_response(verify_response)
            verified_claims.append({"claim": claim, **synthesis})

            # time.sleep(4)

        except Exception as e:
            logger.error(f"Fact-check synthesis failed for claim '{claim}': {e}")
            verified_claims.append({"claim": claim, "status": "Error", "evidence": "AI synthesis failed."})

    return verified_claims


def analyze_readability(text: str) -> Dict[str, Any]:
    """
    Analyzes the text for readability using the textstat library.
    Returns a dictionary of key metrics.
    """
    if not text or not text.strip():
        return {}
        
    logger.info("Performing readability analysis...")
    try:
        # Flesch Reading Ease: Score from 0-100. Higher is easier. 60-70 is standard.
        flesch_ease = textstat.flesch_reading_ease(text)
        
        # Flesch-Kincaid Grade Level: US school grade level equivalent.
        flesch_grade = textstat.flesch_kincaid_grade(text)
        
        # Gunning Fog Index: Grade level, higher is harder.
        gunning_fog = textstat.gunning_fog(text)
        
        # Dale-Chall Readability Score: Best for general audiences.
        dale_chall = textstat.dale_chall_readability_score(text)
        
        # Word Count
        word_count = textstat.lexicon_count(text, removepunct=True)
        
        # Sentence Count
        sentence_count = textstat.sentence_count(text)

        # Average sentence length
        avg_sentence_length = round(word_count / sentence_count, 2) if sentence_count > 0 else 0

        return {
            "fleschReadingEase": flesch_ease,
            "fleschKincaidGrade": flesch_grade,
            "gunningFog": gunning_fog,
            "daleChall": dale_chall,
            "wordCount": word_count,
            "sentenceCount": sentence_count,
            "avgSentenceLength": avg_sentence_length
        }
    except Exception as e:
        logger.error(f"Textstat readability analysis failed: {e}")
        raise ValueError(f"Could not compute readability scores: {e}")