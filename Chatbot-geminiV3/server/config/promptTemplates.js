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
1.  **Direction:** Use \`graph TD;\` (Top Down) or \`graph LR;\` (Left to Right) for the overall layout.
2.  **Nodes:**
    *   Define unique IDs for each node (e.g., \`A\`, \`B\`, \`C1\`, \`ConceptNameID\`). IDs should be short and alphanumeric.
    *   Node labels should be concise and derived from the text (e.g., \`A["Main Idea from Text"]\`, \`B("Key Concept 1")\`, \`C{"Another Concept"}\`).
3.  **Edges (Connections):** Show relationships using \`-->\` (e.g., \`A --> B\`).
4.  **Hierarchy:** The central theme or document title should be a primary node, with sub-topics branching from it. Deeper sub-topics should branch further.
5.  **Content Focus:** The mind map structure and content (node labels, relationships) must be **strictly** derived from the provided document text. Do not invent concepts or relationships not present in the text.
6.  **Styling (Optional but Recommended):**
    *   You can define a simple class for the root/main node: \`classDef rootStyle fill:#DCEFFD,stroke:#3A77AB,stroke-width:2px,color:#333;\`
    *   Apply it: \`class A rootStyle;\` (assuming 'A' is your root node ID).
    *   Feel free to use other simple styling for clarity if it helps represent the information effectively.

**EXAMPLE OF THINKING & MERMAID OUTPUT (Illustrative - adapt to the actual document content):**

*Assume a short document text:*
"The new 'Alpha Project' aims to improve 'User Engagement' through 'Personalized Content' and 'Interactive Features'. Personalized Content includes 'Tailored Recommendations', while Interactive Features focus on 'Gamification' and 'Real-time Polls'."

*Expected Thinking and Output:*
\`\`\`
<thinking>
## Mermaid Mindmap Generation Plan

1.  **Identify Central Theme:** The core subject is the "Alpha Project". This will be the root node.
2.  **Identify Main Goals/Branches:** The project aims to improve "User Engagement". This is a primary branch.
3.  **Identify Strategies/Sub-Branches for User Engagement:**
    *   "Personalized Content"
    *   "Interactive Features"
4.  **Identify Details/Sub-Sub-Branches:**
    *   Under "Personalized Content": "Tailored Recommendations"
    *   Under "Interactive Features": "Gamification", "Real-time Polls"
5.  **Assign Node IDs & Labels:**
    *   Root: \`A["Alpha Project"]\`
    *   Main Branch: \`B["User Engagement"]\`
    *   Sub-Branches: \`C["Personalized Content"]\`, \`D["Interactive Features"]\`
    *   Sub-Sub-Branches: \`E["Tailored Recommendations"]\`, \`F["Gamification"]\`, \`G["Real-time Polls"]\`
6.  **Define Connections:**
    *   A --> B
    *   B --> C
    *   B --> D
    *   C --> E
    *   D --> F
    *   D --> G
7.  **Choose Graph Direction:** \`graph TD;\` for a top-down structure seems appropriate.
8.  **Add Basic Styling:** Style the root node.
9.  **Construct Mermaid Code:** Assemble the graph definition, nodes, and connections.
</thinking>

graph TD;
    A["Alpha Project"]:::rootStyle;
    B["User Engagement"];
    C["Personalized Content"];
    D["Interactive Features"];
    E["Tailored Recommendations"];
    F["Gamification"];
    G["Real-time Polls"];

    A --> B;
    B --> C;
    B --> D;
    C --> E;
    D --> F;
    D --> G;

    classDef rootStyle fill:#DCEFFD,stroke:#3A77AB,stroke-width:2px,color:#333;
    class A rootStyle;
\`\`\`

**OUTPUT FORMAT (Strict):**
*   Start directly with the Mermaid graph definition (e.g., \`graph TD;\`) (after your detailed thinking process, if used).
*   Do **NOT** include any preamble or explanation before the Mermaid code block.
*   The entire output should be valid Mermaid.js syntax.

**BEGIN OUTPUT (Start with e.g., \`graph TD;\` or \`<thinking>\`):**
`;
            return baseTemplate;
        }
    }
};

const KG_GENERATION_SYSTEM_PROMPT = `You are an expert academic in the field relevant to the provided text. Your task is to meticulously analyze the text chunk and create a detailed, hierarchical knowledge graph fragment.
The output MUST be a valid JSON object with "nodes" and "edges" sections.

Instructions for Node Creation:
1.  Identify CORE CONCEPTS or main topics discussed in the chunk. These should be 'major' nodes (parent: null).
2.  Identify SUB-CONCEPTS, definitions, components, algorithms, specific examples, or key details related to these major concepts. These should be 'subnode' type and have their 'parent' field set to the ID of the 'major' or another 'subnode' they directly belong to. Aim for a granular breakdown.
3.  Node 'id': Use a concise, descriptive, and specific term for the concept (e.g., "Linear Regression", "LMS Update Rule", "Feature Selection"). Capitalize appropriately.
4.  Node 'type': Must be either "major" (for top-level concepts in the chunk) or "subnode".
5.  Node 'parent': For "subnode" types, this MUST be the 'id' of its direct parent node. For "major" nodes, this MUST be null.
6.  Node 'description': Provide a brief (1-2 sentences, max 50 words) definition or explanation of the node's concept as presented in the text.

Instructions for Edge Creation:
1.  Edges represent relationships BETWEEN the nodes you've identified.
2.  The 'from' field should be the 'id' of the child/more specific node.
3.  The 'to' field should be the 'id' of the parent/more general node for hierarchical relationships.
4.  Relationship 'relationship':
    *   Primarily use "subtopic_of" for hierarchical parent-child links.
    *   Also consider: "depends_on", "leads_to", "example_of", "part_of", "defined_by", "related_to" if they clearly apply based on the text.
5.  Ensure all node IDs referenced in edges exist in your "nodes" list for this chunk.

Output Format Example:
{{
  "nodes": [
    {{"id": "Concept A", "type": "major", "parent": null, "description": "Description of A."}},
    {{"id": "Sub-concept A1", "type": "subnode", "parent": "Concept A", "description": "Description of A1."}},
    {{"id": "Sub-concept A2", "type": "subnode", "parent": "Concept A", "description": "Description of A2."}},
    {{"id": "Detail of A1", "type": "subnode", "parent": "Sub-concept A1", "description": "Description of detail."}}
  ],
  "edges": [
    {{"from": "Sub-concept A1", "to": "Concept A", "relationship": "subtopic_of"}},
    {{"from": "Sub-concept A2", "to": "Concept A", "relationship": "subtopic_of"}},
    {{"from": "Detail of A1", "to": "Sub-concept A1", "relationship": "subtopic_of"}},
    {{"from": "Sub-concept A1", "to": "Sub-concept A2", "relationship": "related_to"}} // Example of a non-hierarchical link
  ]
}}

Analyze the provided text chunk carefully and generate the JSON. Be thorough in identifying distinct concepts and their relationships to create a rich graph.
If the text chunk is too short or simple to create a deep hierarchy, create what is appropriate for the given text.
`;
// --- END OF KG GENERATION SYSTEM PROMPT ---

const KG_BATCH_USER_PROMPT_TEMPLATE = `
You will be provided with a list of text chunks.
For EACH text chunk, you MUST perform the following:
1. Analyze the text chunk meticulously based on the detailed system instructions provided.
2. Create a detailed, hierarchical knowledge graph fragment.
3. The output for EACH chunk MUST be a valid JSON object with "nodes" and "edges" sections.

Return a single JSON array where each element of the array is the JSON knowledge graph object for the corresponding input text chunk.
The order of the JSON objects in the output array MUST exactly match the order of the input text chunks. Do not add any other text before or after the JSON array.

Here are the text chunks:
{BATCHED_CHUNK_TEXTS_HERE}

Remember to output ONLY the JSON array containing one JSON KG object per input chunk.
`;
// --- END OF KG BATCH USER PROMPT TEMPLATE ---


module.exports = {
    ANALYSIS_PROMPTS,
    KG_GENERATION_SYSTEM_PROMPT,
    KG_BATCH_USER_PROMPT_TEMPLATE
};
