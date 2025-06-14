// server/config/promptTemplates.js

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
**TASK:** Generate 5-7 Frequently Asked Questions (FAQs) with concise answers based ONLY on the provided text.

**OUTPUT FORMAT (Strict):**
*   Start directly with the first FAQ (after your detailed thinking process, if used). Do **NOT** include any preamble before the first 'Q:'.
*   Format each FAQ as:
    Q: [Question derived ONLY from the text]
    A: [Answer derived ONLY from the text, concise]
*   If the text doesn't support an answer for a potential question, do not invent one. Stick to what's explicitly stated or directly implied.
*   Use Markdown for formatting within answers if appropriate (e.g., lists).

**BEGIN OUTPUT (Start with 'Q:' or \`<thinking>\`):**
`;
            return baseTemplate;
        }
    },
    topics: {
        getPrompt: (docTextForLlm) => {
            let baseTemplate = ANALYSIS_THINKING_PREFIX_TEMPLATE.replace('{doc_text_for_llm}', docTextForLlm);
            baseTemplate += `
**TASK:** Identify the 5-8 most important topics discussed in the provided text. For each topic, provide a 1-2 sentence explanation based ONLY on the text.

**OUTPUT FORMAT (Strict):**
*   Start directly with the first topic (after your detailed thinking process, if used). Do **NOT** include any preamble before the first bullet point.
*   Format as a Markdown bulleted list:
    *   **Topic Name:** Brief explanation derived ONLY from the text content (1-2 sentences max).

**BEGIN OUTPUT (Start with '*   **' or \`<thinking>\`):**
`;
            return baseTemplate;
        }
    },
    mindmap: {
        getPrompt: (docTextForLlm) => {
            let baseTemplate = ANALYSIS_THINKING_PREFIX_TEMPLATE.replace('{doc_text_for_llm}', docTextForLlm);
            baseTemplate += `
**TASK:** Generate a mind map in Mermaid.js syntax representing the key concepts, their hierarchy, and relationships, based ONLY on the provided text.

**CORE REQUIREMENTS FOR MERMAID SYNTAX:**
1.  **Direction:** Use \`graph TD;\` (Top Down) or \`graph LR;\` (Left to Right).
2.  **Nodes:**
    *   Define unique, short, alphanumeric IDs for each node (e.g., \`A\`, \`B\`, \`C1\`).
    *   **CRITICAL:** Node labels containing spaces, special characters, or long text MUST be enclosed in double quotes. Example: \`A["Main Idea from Text"]\`. Do NOT use single quotes or unquoted strings for multi-word labels.
3.  **Edges (Connections):** Show relationships using \`-->\` (e.g., \`A --> B\`).
4.  **Hierarchy:** The central theme should be the primary node. Sub-topics must branch from it.
5.  **Content Focus:** The structure and content (node labels, relationships) must be **strictly** derived from the provided text. Do not invent concepts.
6.  **Styling (Optional):** You can define and apply a simple style for the root node as shown in the example.
7.  **No Extra Text:** The final output must be ONLY valid Mermaid code, starting with \`graph TD;\` or \`graph LR;\` after the thinking block.

**EXAMPLE OF THINKING & MERMAID OUTPUT (Follow this structure precisely):**
<thinking>
## Mermaid Mindmap Generation Plan
1.  **Identify Central Theme:** The "Alpha Project". This is the root node.
2.  **Identify Main Branches:** The project's two strategies: "Personalized Content" and "Interactive Features".
3.  **Identify Sub-Branches:**
    *   Under "Personalized Content": "Tailored Recommendations"
    *   Under "Interactive Features": "Gamification", "Real-time Polls"
4.  **Assign IDs & Labels:**
    *   Root: \`A["Alpha Project"]\`
    *   Branches: \`B["Personalized Content"]\`, \`C["Interactive Features"]\`
    *   Sub-Branches: \`D["Tailored Recommendations"]\`, \`E["Gamification"]\`, \`F["Real-time Polls"]\`
5.  **Define Connections:** \`A --> B\`, \`A --> C\`, \`B --> D\`, \`C --> E\`, \`C --> F\`.
6.  **Construct Mermaid Code:** Assemble the parts into a valid block.
</thinking>

graph TD;
    classDef rootStyle fill:#DCEFFD,stroke:#3A77AB,stroke-width:2px,color:#333;

    A["Alpha Project"]:::rootStyle;
    B["Personalized Content"];
    C["Interactive Features"];
    D["Tailored Recommendations"];
    E["Gamification"];
    F["Real-time Polls"];

    A --> B;
    A --> C;
    B --> D;
    C --> E;
    C --> F;

**BEGIN OUTPUT (Start with \`graph TD;\`, \`graph LR;\` or \`<thinking>\`):**
`;
            return baseTemplate;
        }
    }
};

const KG_GENERATION_SYSTEM_PROMPT = `You are an expert academic in the field relevant to the provided text. Your task is to meticulously analyze the text chunk and create a detailed, hierarchical knowledge graph fragment.
The output MUST be a valid JSON object with "nodes" and "edges" sections.

... (rest of KG prompt is unchanged) ...
`;

const KG_BATCH_USER_PROMPT_TEMPLATE = `
You will be provided with a list of text chunks.
... (rest of KG batch prompt is unchanged) ...
`;

const CHAT_MAIN_SYSTEM_PROMPT = `You are an expert AI assistant... (rest of main prompt is unchanged) ...`; 

const WEB_SEARCH_CHAT_SYSTEM_PROMPT = `You are a helpful AI research assistant... (rest of web search prompt is unchanged) ...`;

const CHAT_USER_PROMPT_TEMPLATES = {
    direct: (userQuery, additionalClientInstructions = null) => {
        let fullQuery = "";
        if (additionalClientInstructions && additionalClientInstructions.trim() !== "") {
            fullQuery += `ADDITIONAL USER INSTRUCTIONS TO CONSIDER (Apply these to your final answer):\n${additionalClientInstructions.trim()}\n\n---\nUSER QUERY:\n`;
        } else {
             fullQuery += `USER QUERY:\n`;
        }
        fullQuery += userQuery;
        return fullQuery;
    },
    rag: (userQuery, ragContextString, additionalClientInstructions = null) => {
        let fullQuery = "Carefully review and synthesize the information from the \"Context Documents\" provided below to answer the user's query. Your answer should be primarily based on these documents. Do NOT include any citation markers like [1], [2] etc. in your response text.\n\n";
        if (additionalClientInstructions && additionalClientInstructions.trim() !== "") {
            fullQuery += `ADDITIONAL USER INSTRUCTIONS TO CONSIDER (Apply these to your final answer, in conjunction with the RAG context):\n${additionalClientInstructions.trim()}\n\n---\n`;
        }
        fullQuery += "--- Context Documents ---\n";
        fullQuery += ragContextString;
        fullQuery += "\n--- End of Context ---\n\nUSER QUERY:\n" + userQuery;
        return fullQuery;
    }
};

// ==============================================================================
// === AGENTIC FRAMEWORK PROMPTS - V3 (Hardened Logic) ===
// ==============================================================================

const createAgenticSystemPrompt = (modelContext, agenticContext, requestContext) => {
  const toolsFormatted = modelContext.available_tools.map(tool => 
    `- Tool Name: "${tool.name}"\n  Description: ${tool.description}\n  Parameters: ${JSON.stringify(tool.parameters)}`
  ).join('\n\n');

  let contextualTriggersSection = `
--- CONTEXTUAL TRIGGERS ---
- General Conversation Mode: No specific tool mode is active.
`;

  // --- REVISED LOGIC TO BE ABSOLUTELY EXPLICIT AND PRIORITIZED ---
  // HIGHEST PRIORITY: If the user explicitly enables web search, this rule MUST be followed.
  if (requestContext.isWebSearchEnabled) {
      contextualTriggersSection = `
--- CONTEXTUAL TRIGGERS ---
- **MODE ACTIVE: Web Search**
- **UNBREAKABLE RULE #1:** The user has explicitly enabled "Web Search" mode. You **MUST** use the "web_search" tool to answer the query. Do not answer from your general knowledge.
- **ACTION:** Use the "web_search" tool. The user's full query should be the 'query' parameter for the tool.
`;
  } 
  // SECOND PRIORITY: If web search is not on, check if a document is selected.
  else if (requestContext.documentContextName) {
      contextualTriggersSection = `
--- CONTEXTUAL TRIGGERS ---
- **MODE ACTIVE: Document RAG**
- **CONTEXT:** A specific document is currently selected for discussion: "${requestContext.documentContextName}".
- **UNBREAKABLE RULE #2:** Because a document is selected, you **MUST** use the "rag_search" tool to answer the user's query. This is mandatory for all questions, including "summarize this," "what is this about?", or any other general query.
- **ACTION:** Use the "rag_search" tool. The user's full query should be the 'query' parameter for the tool.
`;
  }
  // --- END REVISED LOGIC ---

  return `
You are a master AI Tutor. Your defined role is: "${agenticContext.agent_role}".
Your primary objectives are: ${agenticContext.agent_objectives.join(', ')}.
Your base instructions are: "${agenticContext.base_instructions}"

${contextualTriggersSection}

You have access to the following tools to help you answer user queries:
--- AVAILABLE TOOLS ---
${toolsFormatted}
--- END TOOLS ---

Carefully analyze the user's query AND THE CONTEXTUAL TRIGGERS. Your decision MUST be based on the "UNBREAKABLE RULE" if one is present.

**Decision Pathway:**

1.  **TOOL USE (Mandatory if Rule Exists):** If the CONTEXTUAL TRIGGERS section contains an "UNBREAKABLE RULE", you **MUST** follow it. Your *entire response* must be a single, valid JSON object with a 'tool_call' key. Do not add any other text.

    The required JSON format is:
    {
      "tool_call": {
        "tool_name": "the_tool_name_from_the_rule",
        "parameters": {
          "query": "The user's original query text"
        }
      }
    }

2.  **DIRECT ANSWER (Only if No Rule Exists):** If and only if there are no contextual triggers with an "UNBREAKABLE RULE", you may answer the user directly and conversationally.

**Analyze the user's request now and decide your next step: either call a tool with the required JSON or answer directly.**
`;
};

const createSynthesizerPrompt = (originalQuery, toolOutput) => {
  return `
You are an expert AI Tutor. A tool was used to gather the following information to help answer the user's original query.
Your task is to synthesize this information into a single, comprehensive, and helpful response for the user.
If the information is insufficient, state that and answer to the best of your ability. Do not mention that a tool was used. Just provide the final answer.

--- USER'S ORIGINAL QUERY ---
${originalQuery}

--- INFORMATION GATHERED BY TOOL ---
${toolOutput}

--- FINAL ANSWER ---
`;
};


module.exports = {
    ANALYSIS_PROMPTS,
    KG_GENERATION_SYSTEM_PROMPT,
    KG_BATCH_USER_PROMPT_TEMPLATE,
    CHAT_MAIN_SYSTEM_PROMPT,
    WEB_SEARCH_CHAT_SYSTEM_PROMPT,
    CHAT_USER_PROMPT_TEMPLATES,
    createAgenticSystemPrompt,
    createSynthesizerPrompt,
};