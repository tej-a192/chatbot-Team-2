// server/config/promptTemplates.js

const ANALYSIS_THINKING_PREFIX_TEMPLATE = `**STEP 1: THINKING PROCESS (Recommended):**
*   Before generating the analysis, briefly outline your plan in \`<thinking>\` tags. Example: \`<thinking>Analyzing for FAQs. Will scan for key questions and answers presented in the text.</thinking>\`
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
            // ... your existing faq prompt logic ...
            let baseTemplate = ANALYSIS_THINKING_PREFIX_TEMPLATE.replace('{doc_text_for_llm}', docTextForLlm);
            baseTemplate += `
**TASK:** Generate 5-7 Frequently Asked Questions (FAQs) with concise answers based ONLY on the text.

**OUTPUT FORMAT (Strict):**
*   Start directly with the first FAQ (after thinking, if used). Do **NOT** include preamble.
*   Format each FAQ as:
    Q: [Question derived ONLY from the text]
    A: [Answer derived ONLY from the text, concise]
*   If the text doesn't support an answer, don't invent one. Use Markdown for formatting if appropriate (e.g., lists within an answer).

**BEGIN OUTPUT (Start with 'Q:' or \`<thinking>\`):**
`;
            return baseTemplate;
        }
    },
    topics: {
        getPrompt: (docTextForLlm) => {
            // ... your existing topics prompt logic ...
            let baseTemplate = ANALYSIS_THINKING_PREFIX_TEMPLATE.replace('{doc_text_for_llm}', docTextForLlm);
            baseTemplate += `
**TASK:** Identify the 5-8 most important topics discussed. Provide a 1-2 sentence explanation per topic based ONLY on the text.

**OUTPUT FORMAT (Strict):**
*   Start directly with the first topic (after thinking, if used). Do **NOT** include preamble.
*   Format as a Markdown bulleted list:
    *   **Topic Name:** Brief explanation derived ONLY from the text content (1-2 sentences max).

**BEGIN OUTPUT (Start with '*   **' or \`<thinking>\`):**
`;
            return baseTemplate;
        }
    },
    mindmap: {
        getPrompt: (docTextForLlm) => {
            // ... your existing mindmap prompt logic ...
            let baseTemplate = ANALYSIS_THINKING_PREFIX_TEMPLATE.replace('{doc_text_for_llm}', docTextForLlm);
            baseTemplate += `
**TASK:** Generate a mind map outline in Markdown list format representing key concepts and hierarchy ONLY from the text.

**OUTPUT FORMAT (Strict):**
*   Start directly with the main topic as the top-level item (using '-') (after thinking, if used). Do **NOT** include preamble.
*   Use nested Markdown lists ('-' or '*') with indentation (2 or 4 spaces) for hierarchy.
*   Focus **strictly** on concepts and relationships mentioned in the text. Be concise.

**BEGIN OUTPUT (Start with e.g., '- Main Topic' or \`<thinking>\`):**
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
