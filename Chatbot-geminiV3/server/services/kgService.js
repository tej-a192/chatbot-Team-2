// server/services/kgService.js
const geminiService = require('./geminiService');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
// --- IMPORT THE PROMPTS ---
const {
    KG_GENERATION_SYSTEM_PROMPT,
    KG_BATCH_USER_PROMPT_TEMPLATE // Import the new template
} = require('../config/promptTemplates');

// --- MODIFIED: Function to construct the user prompt for a BATCH of chunks ---
function constructKgPromptForBatch(chunkTexts) {
    // chunkTexts is an array of strings, where each string is the text_content of a chunk.
    let formattedChunkTexts = "";
    chunkTexts.forEach((chunkText, index) => {
        formattedChunkTexts += `
--- START OF CHUNK ${index + 1} ---
${chunkText}
--- END OF CHUNK ${index + 1} ---
`;
    });

    // Replace the placeholder in the template with the actual formatted chunk texts
    return KG_BATCH_USER_PROMPT_TEMPLATE.replace('{BATCHED_CHUNK_TEXTS_HERE}', formattedChunkTexts);
}

// --- NEW: Internal function to process a single BATCH of chunks ---
// (This function _processBatchOfChunksForKg remains the same as in the previous good answer)
async function _processBatchOfChunksForKg(batchOfChunkObjects, batchIndex) {
    // batchOfChunkObjects is an array of the original chunk objects
    // e.g., [{ text_content: "...", metadata: {...} }, ...]
    const logPrefix = `[KG Service Batch ${batchIndex}]`;

    const chunkTextsForPrompt = batchOfChunkObjects.map(chunk => chunk.text_content);

    if (chunkTextsForPrompt.length === 0) {
        console.log(`${logPrefix} No text content in this batch. Skipping.`);
        return [];
    }

    const userPromptForBatch = constructKgPromptForBatch(chunkTextsForPrompt); // Uses the new templated function
    const chatHistory = [
        { role: 'user', parts: [{ text: userPromptForBatch }] }
    ];

    try {
        console.log(`${logPrefix} Processing ${chunkTextsForPrompt.length} chunks for KG generation.`);
        const responseText = await geminiService.generateContentWithHistory(
            chatHistory,
            KG_GENERATION_SYSTEM_PROMPT, // System prompt applies to EACH chunk's processing logic
            geminiService.DEFAULT_MAX_OUTPUT_TOKENS_KG
        );

        if (!responseText) {
            console.warn(`${logPrefix} Empty response from Gemini for batch.`);
            return [];
        }

        let cleanedResponseText = responseText.trim();
        // More robust cleaning for ```json ... ``` or ``` ... ``` blocks
        if (cleanedResponseText.startsWith("```json")) {
            cleanedResponseText = cleanedResponseText.substring(7); // Remove ```json
            if (cleanedResponseText.endsWith("```")) {
                cleanedResponseText = cleanedResponseText.slice(0, -3); // Remove ```
            }
        } else if (cleanedResponseText.startsWith("```")) {
            cleanedResponseText = cleanedResponseText.substring(3); // Remove ```
            if (cleanedResponseText.endsWith("```")) {
                cleanedResponseText = cleanedResponseText.slice(0, -3); // Remove ```
            }
        }
        cleanedResponseText = cleanedResponseText.trim();
        console.log("-----------------------------------------------------------------------------------------------------");
        console.log(cleanedResponseText);
        const graphFragmentsArray = JSON.parse(cleanedResponseText);

        if (!Array.isArray(graphFragmentsArray)) {
            console.warn(`${logPrefix} Gemini response was not a JSON array. Response (first 200 chars):`, cleanedResponseText.substring(0, 200));
            return [];
        }

        if (graphFragmentsArray.length !== batchOfChunkObjects.length) {
            console.warn(`${logPrefix} Mismatch: Expected ${batchOfChunkObjects.length} KG fragments, but received ${graphFragmentsArray.length}. Results might be misaligned.`);
        }
        
        const validFragments = [];
        graphFragmentsArray.forEach((fragment, i) => {
            if (fragment && typeof fragment === 'object' && Array.isArray(fragment.nodes) && Array.isArray(fragment.edges)) {
                validFragments.push(fragment);
            } else {
                const chunkRef = batchOfChunkObjects[i]?.metadata?.chunk_reference_name || `chunk index ${i} in batch`;
                console.warn(`${logPrefix} Invalid graph structure from Gemini for ${chunkRef}. Discarding this fragment. Fragment:`, JSON.stringify(fragment).substring(0,100));
            }
        });
        console.log(`${logPrefix} Successfully parsed ${validFragments.length} valid KG fragments from Gemini response.`);
        return validFragments;

    } catch (error) {
        console.error(`${logPrefix} Error processing batch:`, error.message);
        if (error.originalError) console.error(`${logPrefix} Original Gemini error:`, error.originalError);
        if (error.response?.data) console.error(`${logPrefix} Gemini error data:`, error.response.data);
        return [];
    }
}


// --- MERGE FUNCTION (remains the same as your provided version or my previous good one) ---
function _mergeGraphFragments(graphFragments) {
    console.log(`[KG Service] Merging ${graphFragments.length} graph fragments...`);
    const finalNodesMap = new Map();
    const finalEdgesSet = new Set(); // Using a Set to store unique stringified edges

    for (const fragment of graphFragments) {
        if (!fragment || !fragment.nodes || !fragment.edges) {
            console.warn("[KG Service Merge] Skipping invalid or null graph fragment.");
            continue;
        }
        
        // Process Nodes
        for (const node of fragment.nodes) {
            if (!node || typeof node.id !== 'string' || !node.id.trim()) {
                console.warn("[KG Service Merge] Skipping invalid node (missing/empty ID):", node);
                continue;
            }
            const nodeId = node.id.trim();
            if (!finalNodesMap.has(nodeId)) {
                finalNodesMap.set(nodeId, { ...node, id: nodeId });
            } else {
                const existingNode = finalNodesMap.get(nodeId);
                if (node.description && typeof node.description === 'string' &&
                    (!existingNode.description || node.description.length > existingNode.description.length)) {
                    existingNode.description = node.description;
                }
                if (node.type && (!existingNode.type || existingNode.type === "generic" || existingNode.type.toLowerCase() === "unknown")) {
                    existingNode.type = node.type;
                }
                if (node.parent && !existingNode.parent) {
                    existingNode.parent = node.parent;
                }
            }
        }

        // Process Edges
        for (const edge of fragment.edges) {
            if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string' || typeof edge.relationship !== 'string' ||
                !edge.from.trim() || !edge.to.trim() || !edge.relationship.trim()) {
                console.warn("[KG Service Merge] Skipping invalid edge (missing from/to/relationship or empty):", edge);
                continue;
            }
            const edgeKey = `${edge.from.trim()}|${edge.to.trim()}|${edge.relationship.trim().toUpperCase()}`;
            finalEdgesSet.add(edgeKey);
        }
    }

    const mergedNodes = Array.from(finalNodesMap.values());
    const mergedEdges = Array.from(finalEdgesSet).map(edgeKey => {
        const [from, to, relationship] = edgeKey.split('|');
        return { from, to, relationship };
    });

    console.log(`[KG Service Merge] Merged into ${mergedNodes.length} nodes and ${mergedEdges.length} edges.`);
    return { nodes: mergedNodes, edges: mergedEdges };
}

// --- MODIFIED: Main function for KG generation and storage ---
// (This function generateAndStoreKg remains the same as in the previous good answer)
async function generateAndStoreKg(chunksForKg, userId, originalName) {
    const logPrefix = `[KG Service Doc: ${originalName}, User: ${userId}]`;
    console.log(`${logPrefix} Starting KG generation with ${chunksForKg.length} initial chunks.`);

    if (!chunksForKg || chunksForKg.length === 0) {
        console.warn(`${logPrefix} No chunks provided for KG generation.`);
        return { success: true, message: "No chunks to process for KG.", finalKgNodesCount: 0, finalKgEdgesCount: 0 };
    }

    const allGraphFragments = [];
    const BATCH_SIZE = parseInt(process.env.KG_GENERATION_BATCH_SIZE) || 50;
    console.log(`${logPrefix} Using batch size: ${BATCH_SIZE}`);
    let batchIndex = 0;

    for (let i = 0; i < chunksForKg.length; i += BATCH_SIZE) {
        batchIndex++;
        const currentBatchOfChunks = chunksForKg.slice(i, i + BATCH_SIZE);
        
        const validChunksInBatch = currentBatchOfChunks.filter(chunk => chunk && chunk.text_content && chunk.text_content.trim() !== '');
        if (validChunksInBatch.length === 0) {
            console.log(`${logPrefix} Batch ${batchIndex} has no valid chunks with text. Skipping.`);
            continue;
        }
        
        console.log(`${logPrefix} Processing batch ${batchIndex} (chunks ${i} to ${Math.min(i + BATCH_SIZE - 1, chunksForKg.length - 1)}), ${validChunksInBatch.length} valid chunks.`);
        
        const fragmentsFromBatch = await _processBatchOfChunksForKg(validChunksInBatch, batchIndex); // Calls the new batch processor
        if (fragmentsFromBatch && fragmentsFromBatch.length > 0) {
            allGraphFragments.push(...fragmentsFromBatch);
        } else {
            console.warn(`${logPrefix} Batch ${batchIndex} yielded no valid graph fragments.`);
        }
    }

    if (allGraphFragments.length === 0) {
        console.warn(`${logPrefix} No valid graph fragments were generated from any batch.`);
        return { success: true, message: "No KG data extracted from any document chunks.", finalKgNodesCount: 0, finalKgEdgesCount: 0 };
    }

    console.log(`${logPrefix} Generated a total of ${allGraphFragments.length} raw graph fragments. Merging...`);
    const finalKg = _mergeGraphFragments(allGraphFragments);
    
    if (!finalKg || finalKg.nodes.length === 0) {
        console.warn(`${logPrefix} Merged KG has no nodes. Nothing to store.`);
         return { success: true, message: "Merged KG was empty after processing all fragments.", finalKgNodesCount: 0, finalKgEdgesCount: 0 };
    }
    console.log(`${logPrefix} Merged KG successfully. Nodes: ${finalKg.nodes.length}, Edges: ${finalKg.edges.length}.`);

    // --- Storing the KG (your existing logic) ---
    const baseRagUrl = process.env.PYTHON_RAG_SERVICE_URL || process.env.DEFAULT_PYTHON_RAG_URL || 'http://localhost:5000';
    const kgIngestionApiUrl = `${baseRagUrl.replace(/\/$/, '')}/kg`;

    if (!kgIngestionApiUrl.startsWith('http')) {
        console.error(`${logPrefix} KG Ingestion API URL is invalid: ${kgIngestionApiUrl}. Check PYTHON_RAG_SERVICE_URL.`);
        return {
            success: false,
            message: "KG generated, but KG Ingestion API URL is invalid. KG not stored.",
            finalKgNodesCount: finalKg.nodes.length,
            finalKgEdgesCount: finalKg.edges.length
        };
    }

    console.log(`${logPrefix} Sending final merged KG to Ingestion API: ${kgIngestionApiUrl}`);
    try {
        const payload = {
            userId: userId,
            originalName: originalName,
            nodes: finalKg.nodes,
            edges: finalKg.edges
        };

        const serviceResponse = await axios.post(kgIngestionApiUrl, payload, {
            timeout: 300000
        });

        const responseData = serviceResponse.data;
        const API_SUCCESS_STATUS_VALUE = "completed";

        if (serviceResponse.status >= 200 && serviceResponse.status < 300 && responseData && responseData.status === API_SUCCESS_STATUS_VALUE) {
            if (responseData['documentName'] !== originalName || responseData.userId !== userId) {
                console.warn(`${logPrefix} Mismatch in KG API response. Expected doc/user: ${originalName}/${userId}, Got: ${responseData['documentName']}/${responseData.userId}`);
            }
            const successMessage = `KG for '${originalName}' successfully processed by Ingestion API. Status: ${responseData.status}. Nodes: ${finalKg.nodes.length}, Edges: ${finalKg.edges.length}`;
            console.log(`${logPrefix} ${successMessage}`);
            return {
                success: true,
                message: successMessage,
                serviceResponseData: responseData,
                finalKgNodesCount: finalKg.nodes.length,
                finalKgEdgesCount: finalKg.edges.length
            };
        } else {
            const failureMessage = `KG Ingestion API for '${originalName}' indicated failure or unexpected status. HTTP: ${serviceResponse.status}, API Status: '${responseData?.status || "N/A"}'. API Msg: ${responseData?.message || responseData?.error || 'No specific error from API.'}`;
            console.warn(`${logPrefix} ${failureMessage}`);
            return {
                success: false,
                message: failureMessage,
                serviceResponseData: responseData,
                finalKgNodesCount: finalKg.nodes.length,
                finalKgEdgesCount: finalKg.edges.length
            };
        }
    } catch (error) {
        const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message || "Unknown error calling KG Ingestion API";
        console.error(`${logPrefix} Error calling KG Ingestion API:`, errorMsg);
        if (error.response?.data) console.error(`${logPrefix} KG API Error Response Data:`, error.response.data);
        if (error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
            console.error(`${logPrefix} KG Ingestion API call timed out.`);
        }
        return {
            success: false,
            message: `KG generated, but error calling KG Ingestion API: ${errorMsg}`,
            finalKgNodesCount: finalKg.nodes.length,
            finalKgEdgesCount: finalKg.edges.length
        };
    }
}

module.exports = { generateAndStoreKg };