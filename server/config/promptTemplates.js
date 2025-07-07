// server/config/promptTemplates.js

// ==============================================================================
// === DOCUMENT ANALYSIS PROMPTS (for FAQ, Topics, Mindmap) ===
// ==============================================================================

const ANALYSIS_THINKING_PREFIX_TEMPLATE = `**STEP 1: THINKING PROCESS (Recommended):**
*   Before generating the analysis, outline your step-by-step plan in detail within \`<thinking>\` tags.
*   Use Markdown for formatting within your thinking process (e.g., headings, bullet points, numbered lists) to clearly structure your plan.
*   Example of detailed thinking:
    \`\`\`
    <thinking>
    ## FAQ Generation Plan
    1.  **Understand Goal:** Generate 5-7 FAQs based *only* on the provided text.
    2.  **Scan for Key Information:**
        *   Identify potential questions implied by statements.
        *   Look for definitions, explanations, or problem/solution pairings.
    3.  **Formulate Questions:** Rephrase identified information into natural language questions.
    4.  **Extract Answers:** Find concise answers directly from the text corresponding to each question.
    5.  **Format Output:** Ensure each Q/A pair follows the 'Q: ... A: ...' format.
    6.  **Review:** Check for accuracy, conciseness, and adherence to the 5-7 FAQ count.
    </thinking>
    \`\`\`
*   If you include thinking, place the final analysis *after* the \`</thinking>\` tag.

**STEP 2: ANALYSIS OUTPUT:**
*   Generate the requested analysis based **strictly** on the text provided below.
*   Follow the specific OUTPUT FORMAT instructions carefully.

--- START DOCUMENT TEXT ---
{doc_text_for_llm}
--- END DOCUMENT TEXT ---
`;

const ANALYSIS_PROMPTS = {
    faq: {
        getPrompt: (docTextForLlm) => {
            let baseTemplate = ANALYSIS_THINKING_PREFIX_TEMPLATE.replace('{doc_text_for_llm}', docTextForLlm);
            baseTemplate += `
**TASK:** Generate a set of 10-15 Frequently Asked Questions (FAQs) with concise answers based ONLY on the provided text. To ensure a logical flow, you MUST organize the FAQs by the main themes found in the document.

**OUTPUT FORMAT (Strict):**
1.  **Thematic Grouping:** Identify 5-6 major themes from the document. For each theme, create a Markdown H2 heading (e.g., \`## Core Concepts\`).
2.  **Question as Sub-Heading:** Under each theme, each question MUST be a Markdown H3 heading (e.g., \`### 1. What is the primary subject?\`).
3.  **Answer as Text:** The answer should follow directly after the question's heading as a standard paragraph.
4.  **Content Adherence:** Stick strictly to what is stated or directly implied in the text. Do not invent information.
5.  **Avoid Code Block Answer:** Strictly avoid the responses in a block of code. You need to give the Text with markdown which can be easily rendered on ui.

The document is about the five-part process for improving communication skills, focusing on changing habits through self-assessment and a structured plan.

### 1. What is the definition of a "transcription audit"?
A transcription audit is the process of reviewing a transcribed video of oneself to highlight and become aware of non-words and filler words like "um," "ah," and "like."

**BEGIN OUTPUT (Start with '##' for the first theme or \`<thinking>\`):**
`;
            return baseTemplate;
        }
    },
    topics: {
        getPrompt: (docTextForLlm) => {
            let baseTemplate = ANALYSIS_THINKING_PREFIX_TEMPLATE.replace('{doc_text_for_llm}', docTextForLlm);
            baseTemplate += `
**TASK:** Identify the 5-7 most important topics or concepts from the provided text. For each topic, provide a clear explanation and include a specific example or key data point from the text to illustrate it.

**OUTPUT FORMAT (Strict):**
*   Use Markdown H3 (###) for each topic name for clear separation and structure.
*   Avoid Code Block Answer: Strictly avoid the responses in a block of code. You need to give the Text with markdown which can be easily rendered on ui.
*   Beneath each heading, provide:
    *   An **Explanation:** of the topic in your own words, but based strictly on the text. Start this with the bolded label '**Explanation:**'.
    *   A specific **Example from Text:**. Start this with the bolded label '**Example from Text:**' followed by a direct quote or a paraphrased key data point from the source document.

**EXAMPLE OUTPUT STRUCTURE:**

### Topic 1: Name of the First Key Concept
**Explanation:** A brief summary of what this concept is and why it's important, according to the document.
**Example from Text:** "The document states that 'the reaction requires a temperature of over 100 million degrees Celsius' which highlights the extreme conditions needed."

1.  **Direction:** Use \`graph TD;\` or \`mindmap\`.
2.  **Nodes:** Define unique IDs and concise labels derived from the text.
3.  **Edges:** Show relationships using \`-->\`.
4.  **Hierarchy:** The central theme should be the root.

**OUTPUT FORMAT (CRITICAL - FOLLOW EXACTLY):**
*   Your response **MUST** start directly with the Mermaid graph definition (e.g., \`graph TD;\` or \`mindmap\`).
*   **DO NOT** wrap your response in a Markdown code block like \`\`\`mermaid ... \`\`\`.
*   **DO NOT** include any preamble, explanation, or any text before the first line of Mermaid code.

**EXAMPLE OF A CORRECT OUTPUT:**
mindmap
  root((Main Idea))
    Topic 1
      Sub-Topic 1.1
    Topic 2

**BEGIN OUTPUT (Start immediately with 'graph', 'mindmap', etc.):**
`;
            return baseTemplate;
        }
    }
};

const KG_GENERATION_SYSTEM_PROMPT = `You are an expert data architect. Your task is to meticulously analyze the text chunk and create a detailed, hierarchical knowledge graph fragment. The output MUST be a valid JSON object with "nodes" and "edges" sections. Do not add any text before or after the JSON.`;
const KG_BATCH_USER_PROMPT_TEMPLATE = `For EACH text chunk below, create a JSON knowledge graph fragment. Return a single JSON array where each element is the graph for the corresponding chunk. The order must match.
Here are the text chunks:
{BATCHED_CHUNK_TEXTS_HERE}
`;

const CHAT_MAIN_SYSTEM_PROMPT = `You are an expert AI assistant. Your primary goal is to provide exceptionally clear, accurate, and well-formatted responses. Always prioritize provided context documents. You MUST remember personal details (like a user's name) if provided in the current conversation. Format responses with Markdown and KaTeX for math.`;
const WEB_SEARCH_CHAT_SYSTEM_PROMPT = `You are a helpful AI research assistant. Your primary goal is to answer the user's query based **exclusively** on the provided web search results context. You MUST cite your sources at the end of each sentence that uses information, like so: "This is a fact [1]." and "This is another fact from two sources [2, 3]."`;
const CHAT_USER_PROMPT_TEMPLATES = {
    direct: (userQuery, additionalClientInstructions = null) => {
        let fullQuery = `USER QUERY:\n${userQuery}`;
        if (additionalClientInstructions) {
            fullQuery = `ADDITIONAL INSTRUCTIONS:\n${additionalClientInstructions}\n\n---\n${fullQuery}`;
        }
        return fullQuery;
    },
    rag: (userQuery, ragContextString, additionalClientInstructions = null) => {
        let fullQuery = `Based on the provided "Context Documents", answer the user's query. Do not include citation markers like [1].\n\n--- Context Documents ---\n${ragContextString}\n--- End of Context ---\n\nUSER QUERY:\n${userQuery}`;
        if (additionalClientInstructions) {
            fullQuery = `ADDITIONAL INSTRUCTIONS:\n${additionalClientInstructions}\n\n---\n${fullQuery}`;
        }
        return fullQuery;
    }
};

const createAgenticSystemPrompt = (modelContext, agenticContext, requestContext) => {
  const userQueryForPrompt = requestContext.userQuery || "[User query not provided]";
  
  const requiredJsonFormat = (toolName) => `
Your entire output MUST be a single, valid JSON object with a "tool_call" key.
Do not provide any other text, explanation, or markdown formatting.

**JSON FORMAT:**
\`\`\`json
{
  "tool_call": {
    "tool_name": "${toolName}",
    "parameters": {
      "query": "${userQueryForPrompt}"
    }
  }
}
\`\`\`
  `;

  if (requestContext.isAcademicSearchEnabled) {
    return `
You are a tool-routing agent. The user has **explicitly enabled the 'Academic Search' tool.**
Your ONLY task is to output the JSON to call the \`academic_search\` tool with the user's query.
This is not a suggestion. It is a mandatory instruction.

**User's Query:** "${userQueryForPrompt}"

${requiredJsonFormat('academic_search')}

Provide the JSON to call the \`academic_search\` tool now.
    `;
  }
  
  if (requestContext.isWebSearchEnabled) {
    return `
You are a tool-routing agent. The user has **explicitly enabled the 'Web Search' tool.**
Your ONLY task is to output the JSON to call the \`web_search\` tool with the user's query.
This is not a suggestion. It is a mandatory instruction.

**User's Query:** "${userQueryForPrompt}"

${requiredJsonFormat('web_search')}

Provide the JSON to call the \`web_search\` tool now.
    `;
  }

  if (requestContext.documentContextName) {
    return `
You are a tool-routing agent. The user has selected a document named "${requestContext.documentContextName}".
This means you **MUST** use the \`rag_search\` tool to answer questions about the document.
Your ONLY task is to output the JSON to call the \`rag_search\` tool with the user's query.
This is not optional.

**User's Query:** "${userQueryForPrompt}"

${requiredJsonFormat('rag_search')}

Provide the JSON to call the \`rag_search\` tool now.
    `;
  }

  return `
You are a "Router" agent. Your task is to analyze the user's query and decide which of two actions to take: 'web_search' or 'direct_answer'.

**CONTEXT FOR YOUR DECISION:**
- **Current Mode:** Direct Chat. No specific tool has been pre-selected by the user.
- **User's Query:** "${userQueryForPrompt}"

**YOUR TASK:**
Based on your analysis of the user's query, you MUST choose one action.
- If the query asks for general knowledge, definitions, explanations, creative tasks, or concepts (like "what is X?", "explain Y"), your decision MUST be 'direct_answer'.
- Only if the query explicitly asks for **very recent, real-time information** (e.g., "what is the weather today?", "latest news"), should you choose 'web_search'.

Your entire output MUST be a single, valid JSON object with a "tool_call" key.

- If your decision is 'web_search', format as:
  \`\`\`json
  { "tool_call": { "tool_name": "web_search", "parameters": { "query": "${userQueryForPrompt}" } } }
  \`\`\`
- If your decision is 'direct_answer', format as:
  \`\`\`json
  { "tool_call": null }
  \`\`\`

Provide your JSON decision now.
  `;
};

const createSynthesizerPrompt = (originalQuery, toolOutput, toolName) => {
    const formattingInstructions = `
**Formatting Guidelines (MANDATORY):**
- **Structure:** Use Markdown for headings, lists, bold text, and italics.
- **Clarity:** Use the most appropriate combination of formatting elements to make your answer easy to read and understand.
- **Tables:** If data is tabular, present it as a Markdown table.
- **Code:** If the answer involves code, use fenced code blocks with language identifiers.
`;

    if (toolName === 'academic_search') {
        return `
You are an expert academic research assistant. Your ONLY task is to format the provided list of academic papers into a professional, easy-to-read, and highly useful briefing for a researcher.

**CRITICAL INSTRUCTIONS:**
1.  **Start with a TL;DR Summary:** Begin with a 1-2 sentence "Executive Summary" that synthesizes the main research trends or themes found across all the papers.
2.  **Create Thematic Sections:** Group the papers by their core research theme (e.g., "Parameter-Efficient Fine-Tuning," "Model Compression," "AI Alignment"). Use a Markdown H2 heading (e.g., \`## Parameter-Efficient Fine-Tuning\`) for each theme.
3.  **Format Each Paper as a Detailed Entry:** Under each theme, list the relevant papers. For each paper, you MUST include:
    *   **Title:** The full title of the paper as a clickable Markdown link, in bold. Example: \`**[Mixout: Effective Regularization...](https://arxiv.org/abs/XXXX.XXXXX)**\`
    *   **Authors:** A list of the primary authors.
    *   **Source:** The name of the source (e.g., "ArXiv", "Semantic Scholar").
    *   **Key Insight:** A concise, one-sentence summary of the paper's main finding or contribution, written in your own words.
4.  **Handle No Results:** If the tool output indicates no papers were found, your entire response should be: "I was unable to find any relevant academic papers for your query."

---
**USER'S ORIGINAL QUERY:**
${originalQuery}
---
**INFORMATION GATHERED BY TOOL (Raw list of paper data from 'academic_search'):**
${toolOutput}
---

**YOUR FINAL, PROFESSIONAL RESEARCH BRIEFING:**
`;
    }

    if (toolName === 'web_search') {
        return `
You are an expert AI Research Assistant. Your task is to synthesize the provided "WEB SEARCH RESULTS" into a comprehensive, detailed, and helpful response to the user's query.
Your final response MUST follow this two-part structure precisely:
1.  A detailed, well-written answer to the user's query with inline citations [1].
2.  **References Section:** A formatted list of the sources used.

---
**PART 1: MAIN ANSWER INSTRUCTIONS**
-   Your answer **MUST** be based on the provided search results.
-   When you use information from a source, you **MUST** include its corresponding number in brackets. For example: "The sky appears blue due to Rayleigh scattering [1]."
-   Be comprehensive and use rich Markdown formatting.

---
**PART 2: REFERENCES SECTION INSTRUCTIONS**
-   After the main answer, add a horizontal rule (\`---\`) and a \`## References\` heading.
-   Create a numbered list of all cited sources: \`[1] [Source Title](Source URL)\`.

---
**USER'S ORIGINAL QUERY:**
${originalQuery}

**WEB SEARCH RESULTS:**
${toolOutput}

**YOUR COMPLETE, FORMATTED RESPONSE:**
`;
    }

    return `
You are an expert AI Tutor. A tool was used to gather the following information to help answer the user's original query. Your task is to synthesize this information into a single, comprehensive, and helpful response.

**Response Guidelines:**
1.  **PRIORITIZE TOOL OUTPUT:** Your primary responsibility is to accurately represent the information from the "INFORMATION GATHERED BY TOOL" section.
2.  **BE COMPREHENSIVE:** Do not just give a one-sentence answer. Elaborate on the information found.
3.  **SEAMLESS INTEGRATION:** Present the final answer as a single, coherent response. Do **NOT** mention that a tool was used.
4.  **DO NOT CITE:** Do not include citation markers like [1], [2] in your answer for this tool.

${formattingInstructions}

---
**USER'S ORIGINAL QUERY:**
${originalQuery}
---
**INFORMATION GATHERED BY TOOL (Output from '${toolName}'):**
${toolOutput}
---

**FINAL, DETAILED, AND WELL-FORMATTED ANSWER:**
`;
};

const DOCX_EXPANSION_PROMPT_TEMPLATE = `...`; // Unchanged
const PPTX_EXPANSION_PROMPT_TEMPLATE = `...`; // Unchanged
const PODCAST_SCRIPT_PROMPT_TEMPLATE = `...`; // Unchanged

module.exports = {
    ANALYSIS_PROMPTS,
    KG_GENERATION_SYSTEM_PROMPT,
    KG_BATCH_USER_PROMPT_TEMPLATE,
    CHAT_MAIN_SYSTEM_PROMPT,
    WEB_SEARCH_CHAT_SYSTEM_PROMPT,
    CHAT_USER_PROMPT_TEMPLATES,
    createAgenticSystemPrompt,
    createSynthesizerPrompt,
    DOCX_EXPANSION_PROMPT_TEMPLATE,
    PPTX_EXPANSION_PROMPT_TEMPLATE,
    PODCAST_SCRIPT_PROMPT_TEMPLATE,
};