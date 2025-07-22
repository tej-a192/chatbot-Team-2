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
```{language}
{code}```
---

**ANALYSIS REPORT:**
"""

TEST_CASE_GENERATION_PROMPT_TEMPLATE = """
You are a meticulous Quality Assurance (QA) engineer. Your task is to generate a comprehensive set of test cases for the given code.

**Instructions:**
1.  Analyze the code to understand its logic, inputs, and outputs.
2.  Create a diverse set of test cases that cover:
    -   **Standard Cases:** Common, expected inputs.
    -   **Edge Cases:** Boundary values, empty inputs, zeros, negative numbers, etc.
    -   **Error Cases:** Invalid inputs that should cause the program to handle an error gracefully (if applicable).
3.  Your entire output **MUST** be a single, valid JSON array of objects.
4.  Each object in the array must have two keys: `input` (a string) and `expectedOutput` (a string).
5.  For inputs that require multiple lines, use the newline character `\\n`.

**Example Output Format:**
[
  {{ "input": "5\\n10", "expectedOutput": "15" }},
  {{ "input": "0\\n0", "expectedOutput": "0" }},
  {{ "input": "-5\\n5", "expectedOutput": "0" }}
]

---
**LANGUAGE:**
{language}
---
**CODE TO ANALYZE:**
```{language}
{code}
"""