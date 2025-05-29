// server/services/kgService.js
const geminiService = require('./geminiService'); // Assuming it's in the same folder or adjust path
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs if needed, or rely on LLM
const axios = require('axios');

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


function constructKgPromptForChunk(chunkText) {
    return `
Text chunk to process:
---
${chunkText}
---
Based on the instructions provided in the system prompt, generate the JSON output for nodes and edges from this text chunk.
`;
}



async function _processSingleChunkForKg(chunkTextContent, chunkMetadata, chunkIndex) {
    const userPrompt = constructKgPromptForChunk(chunkTextContent);
    // For this specific task, history is just the current request for the chunk
    const chatHistory = [
        { role: 'user', parts: [{ text: userPrompt }] }
    ];

    try {
        console.log(`[KG Service] Processing chunk ${chunkMetadata?.chunk_reference_name || `index ${chunkIndex}`} for KG generation.`);
        const responseText = await geminiService.generateContentWithHistory(
            chatHistory,
            KG_GENERATION_SYSTEM_PROMPT
        );

        if (!responseText) {
            console.warn(`[KG Service] Empty response from Gemini for chunk ${chunkMetadata?.chunk_reference_name || `index ${chunkIndex}`}.`);
            return null;
        }

        // Attempt to parse the JSON response
        // Gemini might sometimes wrap JSON in ```json ... ```
        let cleanedResponseText = responseText.trim();
        if (cleanedResponseText.startsWith("```json")) {
            cleanedResponseText = cleanedResponseText.substring(7);
            if (cleanedResponseText.endsWith("```")) {
                cleanedResponseText = cleanedResponseText.slice(0, -3);
            }
            cleanedResponseText = cleanedResponseText.trim();
        } else if (cleanedResponseText.startsWith("```")) {
            cleanedResponseText = cleanedResponseText.substring(3);
            if (cleanedResponseText.endsWith("```")) {
                cleanedResponseText = cleanedResponseText.slice(0, -3);
            }
            cleanedResponseText = cleanedResponseText.trim();
        }


        const graphData = JSON.parse(cleanedResponseText);

        // Validate structure
        if (graphData && typeof graphData === 'object' && Array.isArray(graphData.nodes) && Array.isArray(graphData.edges)) {
            // Optionally, add chunk reference to nodes/edges for easier debugging or advanced merging
            // graphData.nodes.forEach(node => node.source_chunk_ref = chunkMetadata?.chunk_reference_name);
            // graphData.edges.forEach(edge => edge.source_chunk_ref = chunkMetadata?.chunk_reference_name);
            return graphData;
        } else {
            console.warn(`[KG Service] Invalid graph structure from Gemini for chunk ${chunkMetadata?.chunk_reference_name || `index ${chunkIndex}`}. Response:`, cleanedResponseText.substring(0, 200));
            return null;
        }
    } catch (error) {
        console.error(`[KG Service] Error processing chunk ${chunkMetadata?.chunk_reference_name || `index ${chunkIndex}`}:`, error.message);
        if (error.originalError) console.error("[KG Service] Original Gemini error:", error.originalError);
        // console.error("[KG Service] Full text that caused error:", userPrompt.substring(0,500)); // Be careful with logging full text
        return null;
    }
}


function _mergeGraphFragments(graphFragments) {
    console.log(`[KG Service] Merging ${graphFragments.length} graph fragments...`);
    const finalNodesMap = new Map(); // Using Map for easier get/set
    const finalEdgesSet = new Set(); // To store unique edge strings like "from|to|relationship"

    for (const fragment of graphFragments) {
        if (!fragment || !fragment.nodes || !fragment.edges) {
            console.warn("[KG Service] Skipping invalid or null graph fragment during merge.");
            continue;
        }

        // Merge Nodes
        for (const node of fragment.nodes) {
            if (!node || typeof node.id !== 'string' || !node.id.trim()) {
                console.warn("[KG Service] Skipping invalid node during merge:", node);
                continue;
            }
            const nodeId = node.id.trim();
            if (!finalNodesMap.has(nodeId)) {
                finalNodesMap.set(nodeId, { ...node, id: nodeId }); // Store a copy
            } else {
                const existingNode = finalNodesMap.get(nodeId);
                // Update description if new one is longer/more descriptive (simple heuristic)
                if (node.description && typeof node.description === 'string' &&
                    (!existingNode.description || node.description.length > existingNode.description.length)) {
                    existingNode.description = node.description;
                }
                // Prefer a more specific type if current is generic or null
                if (node.type && (!existingNode.type || existingNode.type === "generic")) {
                    existingNode.type = node.type;
                }
                // If existing node doesn't have a parent but new one does
                if (node.parent && !existingNode.parent) {
                    existingNode.parent = node.parent;
                }
                // You might add more sophisticated merging logic here if needed
            }
        }

        // Merge Edges
        for (const edge of fragment.edges) {
            if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string' || typeof edge.relationship !== 'string' ||
                !edge.from.trim() || !edge.to.trim() || !edge.relationship.trim()) {
                console.warn("[KG Service] Skipping invalid edge during merge:", edge);
                continue;
            }
            const edgeKey = `${edge.from.trim()}|${edge.to.trim()}|${edge.relationship.trim()}`;
            finalEdgesSet.add(edgeKey);
        }
    }

    const mergedNodes = Array.from(finalNodesMap.values());
    const mergedEdges = Array.from(finalEdgesSet).map(edgeKey => {
        const [from, to, relationship] = edgeKey.split('|');
        return { from, to, relationship };
    });

    console.log(`[KG Service] Merged into ${mergedNodes.length} nodes and ${mergedEdges.length} edges.`);
    return { nodes: mergedNodes, edges: mergedEdges };
}


/**
 * Generates a knowledge graph from chunks of text using Gemini and merges the results.
 * @param {Array<Object>} chunksForKg - Array of chunks, e.g., [{id, text_content, metadata}, ...]
 * @param {string} userId - The ID of the user.
 * @param {string} originalName - The original name of the uploaded file.
 * @returns {Promise<Object|null>} The merged knowledge graph {nodes, edges} or null on failure.
 */




async function generateAndStoreKg(chunksForKg, userId, originalName) {
    console.log(`[KG Service] Starting KG generation for document: ${originalName} (User: ${userId}) with ${chunksForKg.length} chunks.`);

    if (!chunksForKg || chunksForKg.length === 0) {
        console.warn("[KG Service] No chunks provided for KG generation.");
        return null;
    }

    const graphFragments = [];
    // Process chunks sequentially to avoid overwhelming Gemini or hitting rate limits quickly.
    // For parallel processing with controlled concurrency, libraries like 'p-limit' can be used.
    // For now, let's do it sequentially for simplicity and rate-limit safety. If you have many chunks, consider p-limit.
    let chunkIndex = 0;
    for (const chunk of chunksForKg) {
        if (!chunk || !chunk.text_content) {
            console.warn(`[KG Service] Skipping chunk index ${chunkIndex} due to missing text_content.`);
            chunkIndex++;
            continue;
        }
        const fragment = await _processSingleChunkForKg(chunk.text_content, chunk.metadata, chunkIndex);
        if (fragment) {
            graphFragments.push(fragment);
        }
        chunkIndex++;
        // Optional: Add a small delay if you're concerned about hitting API rate limits rapidly
        // await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
    }


    // Alternative: Parallel processing with Promise.all (can be faster, but watch for rate limits)
    /*
    const processingPromises = chunksForKg.map((chunk, index) => {
        if (!chunk || !chunk.text_content) {
            console.warn(`[KG Service] Skipping chunk index ${index} due to missing text_content.`);
            return Promise.resolve(null); // Resolve with null for invalid chunks
        }
        return _processSingleChunkForKg(chunk.text_content, chunk.metadata, index);
    });

    const settledFragments = await Promise.allSettled(processingPromises);
    const graphFragments = settledFragments
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);

    settledFragments.forEach(result => {
        if (result.status === 'rejected') {
            console.error("[KG Service] A chunk processing promise was rejected:", result.reason);
        }
    });
    */


    if (graphFragments.length === 0) {
        console.warn(`[KG Service] No valid graph fragments were generated for ${originalName}.`);
        return null;
    }

    const finalKg = _mergeGraphFragments(graphFragments);

    // --- THIS IS WHERE YOU'D INTEGRATE NEO4J LATER ---
    // For now, we just log it.
    // console.log(`[KG Service] Successfully generated KG for document: ${originalName}`);
    // console.log("[KG Service] Final Merged KG (Nodes):", JSON.stringify(finalKg.nodes.slice(0, 5), null, 2) + (finalKg.nodes.length > 5 ? "\n..." : "")); // Log first 5 nodes
    // console.log("[KG Service] Final Merged KG (Edges):", JSON.stringify(finalKg.edges.slice(0, 5), null, 2) + (finalKg.edges.length > 5 ? "\n..." : "")); // Log first 5 edges
    // To see the full graph: console.log("[KG Service] Full Final Merged KG:", JSON.stringify(finalKg, null, 2));
    console.log("[KG Service] Full Final Merged KG : ", finalKg);
    

        // --- Determine and Call the KG Ingestion API ---
    const baseRagUrl = process.env.DEFAULT_PYTHON_RAG_URL || 'http://localhost:5000'; // Use default if not set
    const kgIngestionApiUrl = `${baseRagUrl.replace(/\/$/, '')}/kg`; // Ensure no double slash and append /kg

    if (!kgIngestionApiUrl.startsWith('http')) { // Basic check if a valid URL was formed
        console.error("[KG Service] KG Ingestion API URL could not be determined properly. Check DEFAULT_PYTHON_RAG_URL. Current URL:", kgIngestionApiUrl);
        return {
            success: false,
            message: "KG generated, but KG Ingestion API URL is invalid. KG not stored.",
        };
    }

    console.log(`[KG Service] Sending KG for '${originalName}' to KG Ingestion API: ${kgIngestionApiUrl}`);
    try {
        const payload = {
            userId: userId,
            originalName: originalName,
            nodes: finalKg.nodes,
            edges: finalKg.edges
        };

        const serviceResponse = await axios.post(kgIngestionApiUrl, payload, {
            timeout: 180000 // 3 minute timeout
        });

        const responseData = serviceResponse.data;
        console.log(`[KG Service] KG Ingestion API response for '${originalName}':`, responseData);

        // --- Define how to determine success from your API's response ---
        // Example: expecting { "document-name": "...", "status": "completed", "userId": "..." }
        const API_SUCCESS_STATUS_VALUE = "completed"; // <<<< IMPORTANT: CHANGE THIS to your API's actual success status string
        // ---

        if (serviceResponse.status >= 200 && serviceResponse.status < 300 && responseData && responseData.status === API_SUCCESS_STATUS_VALUE) {
            if (responseData['document-name'] !== originalName || responseData.userId !== userId) {
                console.warn(`[KG Service] Mismatch in KG API response for '${originalName}'. Expected doc/user: ${originalName}/${userId}, Got: ${responseData['document-name']}/${responseData.userId}`);
            }
            const successMessage = `KG for '${originalName}' successfully processed by Ingestion API. Status: ${responseData.status}.`;
            console.log(`[KG Service] ${successMessage}`);
            return {
                success: true,
                message: successMessage,
                serviceResponseData: responseData // Pass back the API's response data
            };
        } else {
            const failureMessage = `KG Ingestion API for '${originalName}' indicated failure or unexpected status. HTTP: ${serviceResponse.status}, API Status: '${responseData?.status || "N/A"}'. Response Msg: ${responseData?.message || responseData?.error || 'No specific error from API.'}`;
            console.warn(`[KG Service] ${failureMessage}`);
            return {
                success: false,
                message: failureMessage,
                serviceResponseData: responseData
            };
        }
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message || "Unknown error calling KG Ingestion API";
        console.error(`[KG Service] Error calling KG Ingestion API for '${originalName}':`, errorMsg);
        if (error.response?.data) console.error("[KG Service] KG API Error Response Data:", error.response.data);
        return {
            success: false,
            message: `KG generated, but error calling KG Ingestion API: ${errorMsg}`,
        };
    }
}

module.exports = { generateAndStoreKg };