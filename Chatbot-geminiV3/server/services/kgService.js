// server/services/kgService.js
const geminiService = require('./geminiService'); // Assuming it's in the same folder or adjust path
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs if needed, or rely on LLM

const KG_GENERATION_SYSTEM_PROMPT = `You are an expert in knowledge graph creation. Your task is to read the provided text chunk and create a partial graph-based memory map.
Identify major topics as top-level nodes, subtopics as subnodes under their respective parents, and relationships between nodes.
Output the result ONLY as a valid JSON object with "nodes" and "edges" sections. Ensure the JSON is complete and properly formatted.
All node IDs and relationship types must be strings.
Node IDs should be descriptive and preferably unique within the chunk, but global uniqueness will be handled during merging.
For descriptions, keep them concise (around 1-2 sentences).

Example node: {"id": "Machine Learning Introduction", "type": "major", "parent": null, "description": "An overview of machine learning concepts."}
Example subnode: {"id": "Supervised Learning", "type": "subnode", "parent": "Machine Learning Introduction", "description": "Learning from labeled data."}
Example edge: {"from": "Supervised Learning", "to": "Machine Learning Introduction", "relationship": "subtopic_of"}
Allowed relationship types: subtopic_of, related_to, depends_on, example_of, leads_to.
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
 * @param {string} documentIdInDb - The MongoDB document ID for this file.
 * @returns {Promise<Object|null>} The merged knowledge graph {nodes, edges} or null on failure.
 */




async function generateAndStoreKg(chunksForKg, userId, originalName, documentIdInDb) {
    console.log(`[KG Service] Starting KG generation for document: ${originalName} (DocID: ${documentIdInDb}, User: ${userId}) with ${chunksForKg.length} chunks.`);

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
    console.log(`[KG Service] Successfully generated KG for document: ${originalName} (DocID: ${documentIdInDb})`);
    console.log("[KG Service] Final Merged KG (Nodes):", JSON.stringify(finalKg.nodes.slice(0, 5), null, 2) + (finalKg.nodes.length > 5 ? "\n..." : "")); // Log first 5 nodes
    console.log("[KG Service] Final Merged KG (Edges):", JSON.stringify(finalKg.edges.slice(0, 5), null, 2) + (finalKg.edges.length > 5 ? "\n..." : "")); // Log first 5 edges
    // To see the full graph: console.log("[KG Service] Full Final Merged KG:", JSON.stringify(finalKg, null, 2));


    // You might want to return the KG structure or a success status.
    // The worker will get this return value.
    return { success: true, knowledgeGraph: finalKg, documentId: documentIdInDb };
}

module.exports = { generateAndStoreKg };