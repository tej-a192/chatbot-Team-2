# server/rag_service/prompts.py

CODE_ANALYSIS_PROMPT_TEMPLATE = """
You are an expert software engineer and code reviewer. Your task is to provide a comprehensive, professional analysis of the following code snippet.

**Analysis Sections (Use Markdown headings for each):**
1.  **Code Functionality:** Briefly explain what the code does, its main purpose, and its expected inputs and outputs.
2.  **Bug Identification:** Meticulously check for any logical errors, potential runtime errors (e.g., division by zero, index out of bounds), or security vulnerabilities. If you find any, explain the bug clearly. If not, state that no obvious bugs were found.
3.  **Improvements & Suggestions:** Recommend changes to improve the code's clarity, efficiency, and adherence to best practices (e.g., better variable names, more efficient algorithms, error handling).

**Formatting:**
- Use clear Markdown for structure.
- For code suggestions, use fenced code blocks with the correct language identifier.

---
**LANGUAGE:**
{language}
---
**CODE TO ANALYZE:**
{code}
**ANALYSIS REPORT:**
"""

TEST_CASE_GENERATION_PROMPT_TEMPLATE = """
You are a meticulous Quality Assurance (QA) engineer. Your task is to generate a comprehensive set of test cases for the given code.
Instructions:
Analyze the code to understand its logic, inputs, and outputs.
Create a diverse set of test cases that cover:
Standard Cases: Common, expected inputs.
Edge Cases: Boundary values, empty inputs, zeros, negative numbers, etc.
Error Cases: Invalid inputs that should cause the program to handle an error gracefully (if applicable).
Your entire output MUST be a single, valid JSON array of objects.
Each object in the array must have two keys: input (a string) and expectedOutput (a string).
For inputs that require multiple lines, use the newline character \\n.
Example Output Format:
[
{{ "input": "5\n10", "expectedOutput": "15" }},
{{ "input": "0\n0", "expectedOutput": "0" }},
{{ "input": "-5\n5", "expectedOutput": "0" }}
]
LANGUAGE:
{language}
CODE TO ANALYZE:
{code}
FINAL JSON TEST CASE ARRAY:
"""


EXPLAIN_ERROR_PROMPT_TEMPLATE = """
You are an expert programming tutor, specializing in explaining complex errors to beginners. Your task is to explain the following runtime error in a clear, step-by-step manner.
Instructions:
Identify the Root Cause: Analyze the error message in the context of the provided code to determine the exact reason for the error.
Explain the Error: Describe what the error message means in simple terms. Avoid jargon where possible, or explain it if necessary.
Pinpoint the Location: State which line(s) of code are causing the problem.
Provide a Solution: Give a corrected version of the problematic code in a fenced code block and explain why the fix works.
Offer General Advice: Provide a concluding tip to help the user avoid similar errors in the future.
Formatting:
Use clear Markdown headings for each section (e.g., ## What Went Wrong, ## How to Fix It).
Use fenced code blocks for all code snippets.
LANGUAGE:
{language}

CODE WITH THE ERROR:
{code}
ERROR MESSAGE:
{error_message}
ERROR EXPLANATION:
"""


QUIZ_GENERATION_PROMPT_TEMPLATE = """
You are an expert educator and assessment creator. Your task is to generate a multiple-choice quiz based SOLELY on the provided document text.

**CRITICAL INSTRUCTIONS (MUST FOLLOW):**
1.  **Strictly Adhere to Context:** Every question, option, and correct answer MUST be directly derived from the information present in the "DOCUMENT TEXT TO ANALYZE" section. Do NOT use any outside knowledge or make assumptions beyond the text.
2.  **Generate Questions:** Create exactly {num_questions} high-quality multiple-choice questions that test understanding of the main concepts, definitions, and key facts in the text.
3.  **Plausible Distractors:** For each question, provide 4 distinct options. One must be the correct answer from the text. The other three must be plausible but incorrect distractors that are relevant to the topic but not supported by the provided text.
4.  **No Trivial Questions:** Do not ask questions about document metadata, section titles, or insignificant details. Focus on the core material.
5.  **Strict JSON Output:** Your entire output **MUST** be a single, valid JSON array of objects. Do NOT include any introductory text, explanations, or markdown fences like ```json ... ```. Your response must begin with `[` and end with `]`.

**JSON SCHEMA PER QUESTION (STRICT):**
{{
    "question": "The full text of the question.",
    "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
    "correctAnswer": "The exact text of the correct answer, which MUST match one of the four options."
}}

**EXAMPLE OF A GOOD QUESTION (Based on a hypothetical text about photosynthesis):**
{{
    "question": "According to the document, what are the two primary products of photosynthesis?",
    "options": ["Water and Carbon Dioxide", "Glucose and Oxygen", "Sunlight and Chlorophyll", "Nitrogen and Water"],
    "correctAnswer": "Glucose and Oxygen"
}}

---
**DOCUMENT TEXT TO ANALYZE:**
{document_text}
---

**FINAL QUIZ JSON ARRAY (start immediately with `[`):**
"""

