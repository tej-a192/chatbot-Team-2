// server/routes/chat.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const ChatHistory = require('../models/ChatHistory');
const { generateContentWithHistory } = require('../services/geminiService');
const axios = require('axios');

const router = express.Router();

// --- Helper to call Python RAG Query Endpoint ---
<<<<<<< HEAD
async function queryPythonRagService(userId, query, k = 5, filter = null) { // userId is already a param
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL || process.env.DEFAULT_PYTHON_RAG_URL; // Ensure one is set
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL or DEFAULT_PYTHON_RAG_URL is not set in environment. Cannot query RAG service.");
        throw new Error("RAG service configuration error.");
    }
    const searchUrl = `${pythonServiceUrl.replace(/\/$/, '')}/query`; // Ensure no trailing slash before adding /query

    console.log(`Querying Python RAG service for User ${userId} at ${searchUrl} with query (first 50): "${query.substring(0,50)}...", k=${k}`);
    
    const payload = {
        query: query,
        user_id: userId, // <<< ADDED user_id to the payload for Python service
        k: k
    };

    if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) {
        payload.filter = filter; // This filter is for Qdrant
        console.log(`  Applying Qdrant filter to Python RAG search:`, filter);
    } else {
        console.log(`  No Qdrant filter applied to Python RAG search.`);
=======
async function queryPythonRagService(userId, query, k = 5, filter = null) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set. RAG features disabled for this request.");
        return []; // Return empty if RAG is not configured, allowing fallback to direct LLM
    }
    const searchUrl = `${pythonServiceUrl}/query`;
    console.log(`Querying Python RAG: User ${userId}, Query (first 50): "${query.substring(0,50)}...", k=${k}`);
    
    const payload = {
        query: query,
        k: k,
        user_id: userId // Ensure Python service expects 'user_id'
    };

    if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) {
        payload.filter = filter;
        console.log(`  Applying filter to Python RAG search:`, filter);
>>>>>>> db12d8d6185be5fd3cae0eafb8a6e054e30dfd4a
    }

    try {
        const response = await axios.post(searchUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 // 30 seconds
        });

<<<<<<< HEAD
        // Python /query now returns:
        // { ..., retrieved_documents_list: [...], knowledge_graphs: { "docName1": kg1, ... } }
        if (response.data && Array.isArray(response.data.retrieved_documents_list)) {
            console.log(`Python RAG service /query returned ${response.data.qdrant_results_count} Qdrant results.`);
            
            const adaptedDocs = response.data.retrieved_documents_list.map(doc => {
                const metadata = doc.metadata || {};
                return {
                    documentName: metadata.original_name || metadata.file_name || metadata.title || 'Unknown Document',
                    content: doc.page_content || "", 
                    score: metadata.score,
                };
            });
            
            console.log(`  Adapted ${adaptedDocs.length} documents for Node.js service.`);
            return { // Return an object now
                relevantDocs: adaptedDocs,
                knowledge_graphs: response.data.knowledge_graphs || {} // Pass through the KG data
            };

        } else {
             console.warn(`Python RAG service /query returned unexpected data structure:`, response.data);
             throw new Error("Received unexpected data structure from RAG query service.");
=======
        // Adapt this based on the exact structure of your Python RAG service's response
        if (response.data && Array.isArray(response.data.retrieved_documents_list)) {
            console.log(`Python RAG service /query returned ${response.data.retrieved_documents_list.length} results.`);
            return response.data.retrieved_documents_list.map(doc => ({
                documentName: doc.metadata?.original_name || doc.metadata?.file_name || doc.metadata?.title || 'Unknown Document',
                content: doc.page_content || "",
                score: doc.metadata?.score,
                // Include other relevant metadata from Python RAG if needed
            }));
>>>>>>> db12d8d6185be5fd3cae0eafb8a6e054e30dfd4a
        }
        console.warn(`Python RAG /query returned unexpected data structure:`, response.data);
        return [];
    } catch (error) {
<<<<<<< HEAD
        // ... (your existing error handling for queryPythonRagService) ...
        const errorStatus = error.response?.status;
        const errorData = error.response?.data;
        let errorMsg = "Unknown RAG search error";

        if (errorData) {
            if (typeof errorData === 'string' && errorData.toLowerCase().includes("<!doctype html>")) {
                errorMsg = `HTML error page received from Python RAG service (Status: ${errorStatus}). URL (${searchUrl}) might be incorrect or Python service has an issue.`;
            } else {
                errorMsg = errorData?.error || error.message || "Error response from RAG service had no specific message.";
            }
        } else if (error.request) {
            errorMsg = `No response received from Python RAG service at ${searchUrl}. It might be down or unreachable.`;
        } else {
            errorMsg = error.message;
        }
        console.error(`Error querying Python RAG service at ${searchUrl}. Details: ${errorMsg}`, error.response ? error.response.data : error);
        throw new Error(`RAG Query Failed: ${errorMsg}`);
    }
}

// --- @route   POST /api/chat/rag ---
router.post('/rag', tempAuth, async (req, res) => {
    const { message, filter } = req.body; // 'filter' here is the Qdrant filter if provided by client
    const userId = req.user._id.toString(); 

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }

    console.log(`>>> POST /api/chat/rag: User=${userId}. Query: "${message.substring(0,50)}..."`);

    try {
        const kValue = parseInt(process.env.RAG_DEFAULT_K) || 5; 
        const clientFilterForQdrant = filter && typeof filter === 'object' ? filter : null; 
        
        // queryPythonRagService now returns an object: { relevantDocs, knowledge_graphs }
        const ragQueryResult = await queryPythonRagService(userId, message.trim(), kValue, clientFilterForQdrant); 
        
        console.log(`<<< POST /api/chat/rag successful for User ${userId}. Found ${ragQueryResult.relevantDocs.length} Qdrant docs and KGs for ${Object.keys(ragQueryResult.knowledge_graphs || {}).length} docs.`);
        
        // Send both relevantDocs (for context string) and knowledge_graphs to the client
        res.status(200).json({ 
            relevantDocs: ragQueryResult.relevantDocs, // For RAG context
            knowledge_graphs: ragQueryResult.knowledge_graphs // For client-side display/use
        });

    } catch (error) { 
        console.error(`!!! Error processing RAG query for User ${userId}:`, error.message);
        res.status(500).json({ message: error.message || "Failed to retrieve relevant documents and/or knowledge graphs." });
    }
});

function formatKnowledgeGraphForLLM(knowledgeGraphs) {
    if (!knowledgeGraphs || typeof knowledgeGraphs !== 'object' || Object.keys(knowledgeGraphs).length === 0) {
        return ""; // Return empty string if no KG data
    }

    let kgString = "\n\n--- Retrieved Knowledge Graph Information ---\n";
    let kgCitationHints = [];

    Object.entries(knowledgeGraphs).forEach(([docName, kgData]) => {
        if (!kgData || (!Array.isArray(kgData.nodes) || kgData.nodes.length === 0) && (!Array.isArray(kgData.edges) || kgData.edges.length === 0)) {
            if(kgData.message === "KG not found" || kgData.error) {
                kgString += `For document "${docName}": ${kgData.message || kgData.error}\n`;
            } else {
                kgString += `For document "${docName}": No specific KG data was extracted or found.\n`;
            }
            return;
        }
        
        kgString += `\nKnowledge Graph for document: "${docName}":\n`;
        kgCitationHints.push(docName); // Add doc name to citation hints

        // Format Nodes
        if (kgData.nodes && kgData.nodes.length > 0) {
            kgString += "Key Concepts (Nodes):\n";
            kgData.nodes.forEach(node => {
                // Example: "Concept A (Type: major): Description of A. Parent: None."
                // Example: "Sub-concept A1 (Type: subnode): Description of A1. Parent: Concept A."
                const parentInfo = node.parent ? ` (Parent: ${node.parent})` : '';
                kgString += `- ${node.id} (Type: ${node.type || 'N/A'})${parentInfo}: ${node.description || 'No description.'}\n`;
            });
        }

        // Format Edges
        if (kgData.edges && kgData.edges.length > 0) {
            kgString += "Relationships (Edges):\n";
            kgData.edges.forEach(edge => {
                // Example: "Sub-concept A1 --[subtopic_of]--> Concept A"
                kgString += `- ${edge.from} --[${edge.relationship}]--> ${edge.to}\n`;
            });
        }
        kgString += "---\n";
    });
    
    kgString += "--- End of Knowledge Graph Information ---\n";
    return { kgFormattedString: kgString, kgCitationHints: kgCitationHints };
}


router.post('/message', tempAuth, async (req, res) => {
    // Now expecting knowledge_graphs in the payload
    const { message, history, sessionId, systemPrompt, isRagEnabled, relevantDocs, knowledge_graphs } = req.body;
    const userId = req.user._id.toString();

    // ... (existing validations for message, sessionId, history) ...
    const useRAG = !!isRagEnabled;

    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${useRAG}. KG data received: ${!!knowledge_graphs}`);

    let textualContextString = ""; // For text docs
    let textCitationHints = [];
    let kgContextString = ""; // For KG data
    let kgCitationHints = [];

    try {
        // 1. Process text-based relevantDocs (Qdrant results)
        if (useRAG && Array.isArray(relevantDocs) && relevantDocs.length > 0) {
            console.log(`   RAG Text: Processing ${relevantDocs.length} text documents for context.`);
            textualContextString = "Answer the user's question based primarily on the following context documents and knowledge graph information.\nIf the context documents do not contain the necessary information to answer the question fully, clearly state what information is missing from the context *before* potentially providing an answer based on your general knowledge.\n\n--- Context Documents ---\n";
            
            relevantDocs.forEach((doc, index) => {
                // ... (your existing logic for formatting relevantDocs into textualContextString) ...
                if (!doc || typeof doc.documentName !== 'string' || typeof doc.content !== 'string') {
                    console.warn("   Skipping invalid/incomplete document in relevantDocs:", doc); return;
                }
                const docName = doc.documentName;
                const scoreDisplay = doc.score !== undefined ? `(Rel. Score: ${doc.score.toFixed(4)})` : '';
                textualContextString += `\n[D${index + 1}] Source: ${docName} ${scoreDisplay}\nContent:\n${doc.content}\n---\n`;
                textCitationHints.push(`[D${index + 1}] ${docName}`);
            });
            textualContextString += "\n--- End of Context Documents ---\n";
            console.log(`   Constructed text context string. ${textCitationHints.length} valid text docs used.`);
        } else if (useRAG) {
            console.log(`   RAG Text: No relevant text documents provided or RAG disabled for text.`);
        }

        // 2. Process knowledge_graphs (Neo4j results)
        if (useRAG && knowledge_graphs) {
            console.log(`   RAG KG: Processing knowledge graph data.`);
            const { kgFormattedString: formattedKgStr, kgCitationHints: retrievedKgCitations } = formatKnowledgeGraphForLLM(knowledge_graphs);
            kgContextString = formattedKgStr;
            kgCitationHints = retrievedKgCitations; // These are just document names from KG
            if (kgContextString) {
                console.log(`   Constructed KG context string. KG sources: ${kgCitationHints.join(', ')}`);
            }
        } else if (useRAG) {
            console.log(`   RAG KG: No knowledge graph data provided or RAG disabled for KG.`);
        }
        
        // Combine all context
        let combinedContext = "";
        if (textualContextString) combinedContext += textualContextString;
        if (kgContextString) combinedContext += kgContextString; // Append KG info

        const historyForGeminiAPI = history.map(msg => ({
             role: msg.role,
             parts: msg.parts.map(part => ({ text: part.text || '' }))
        })).filter(msg => msg && msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

        let finalUserQueryText = "";
        if (combinedContext) {
            // Update citation instruction to include both types of sources
            let allCitationExamples = [];
            if (textCitationHints.length > 0) allCitationExamples.push(...textCitationHints.slice(0, 2));
            if (kgCitationHints.length > 0) {
                // For KG, citations might be just document names if not more specific node IDs are used in formatting
                kgCitationHints.slice(0,1).forEach(name => allCitationExamples.push(`[KG - ${name}]`));
            }
            const citationExampleString = allCitationExamples.length > 0 ? `(e.g., ${allCitationExamples.join(', ')})` : "(e.g., [D1] Source Document, [KG - Another Document Name])";
            
            const citationInstruction = `When referencing information ONLY from the context documents or knowledge graphs provided above, please cite the source using the format [D-Number] Document Name for text documents, or [KG - Document Name] for knowledge graph information ${citationExampleString}.`;
            finalUserQueryText = `CONTEXT:\n${combinedContext}\nINSTRUCTIONS: ${citationInstruction}\n\nUSER QUESTION: ${message.trim()}`;
        } else {
            finalUserQueryText = message.trim();
        }
=======
        console.error(`Error querying Python RAG service at ${searchUrl}:`, error.message);
        // Do not throw here, allow fallback to direct LLM
        return []; 
    }
}


// --- @route   POST /api/chat/message ---
// --- @desc    Send a message, get AI response, save interaction ---
// --- @access  Private (authMiddleware applied in server.js) ---
router.post('/message', async (req, res) => {
    // Payload from frontend's CenterPanel:
    // { query, history, sessionId, useRag, llmProvider, systemPrompt }
    const { query, history, sessionId, useRag, llmProvider, systemPrompt } = req.body;
    const userId = req.user._id; // From authMiddleware

    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: 'Session ID required.' });
    }
    if (!Array.isArray(history)) {
        return res.status(400).json({ message: 'Invalid history format.'});
    }

    const currentTimestamp = new Date();
    const userMessageForDb = {
        role: 'user',
        parts: [{ text: query.trim() }],
        timestamp: currentTimestamp
        // Note: 'id' for frontend display is generated client-side
    };

    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${useRag}. Query: "${query.substring(0,50)}..."`);

    try {
        let aiResponseMessageText;
        let thinkingForAI = "User query received. Preparing response."; // Initial thinking
        let referencesForResponse = [];
        let actualSourcePipeline = `${llmProvider || 'gemini'}-direct`;

        let contextForLLM = "";
        let relevantDocsFromRag = [];

        if (useRag) {
            thinkingForAI = `Initiating RAG process for query...`;
            actualSourcePipeline = `${llmProvider || 'gemini'}-rag`;
            
            // Call Python RAG service. Pass userId as string.
            relevantDocsFromRag = await queryPythonRagService(userId.toString(), query.trim());

            if (relevantDocsFromRag && relevantDocsFromRag.length > 0) {
                thinkingForAI += ` Found ${relevantDocsFromRag.length} relevant document chunks. Constructing context.`;
                contextForLLM = "Answer the user's question based primarily on the following context documents. If the context is insufficient, clearly state that before providing a general answer.\n\n--- Context Documents ---\n";
                relevantDocsFromRag.forEach((doc, index) => {
                    contextForLLM += `\n[${index + 1}] Source: ${doc.documentName} (Score: ${doc.score ? doc.score.toFixed(3) : 'N/A'})\nContent:\n${doc.content}\n---\n`;
                    referencesForResponse.push({
                        number: index + 1,
                        source: doc.documentName,
                        content_preview: doc.content.substring(0, 100) + (doc.content.length > 100 ? "..." : "")
                    });
                });
                contextForLLM += "\n--- End of Context ---\n\nWhen referencing information ONLY from the context documents provided above, please cite the source using the format [Number] Document Name.\n\nUSER QUESTION: ";
            } else {
                thinkingForAI += ` No relevant document chunks found by RAG. Proceeding with direct LLM call.`;
            }
        }

        // Prepare history for Gemini (or other LLM)
        // Ensure history format is correct: [{role: 'user'/'model', parts: [{text: ...}]}]
        const historyForLLM = history
            .map(msg => ({
                role: msg.sender === 'bot' ? 'model' : 'user', // Convert sender to role
                parts: msg.parts && Array.isArray(msg.parts) ? msg.parts.map(part => ({ text: part.text || '' })) : [{ text: msg.text || '' }] // Ensure parts structure
            }))
            .filter(msg => msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

        const queryForLLM = contextForLLM + query.trim();
>>>>>>> db12d8d6185be5fd3cae0eafb8a6e054e30dfd4a

        // Add current user query to history for the LLM call
        const fullHistoryForLLM = [
            ...historyForLLM,
            { role: 'user', parts: [{ text: queryForLLM }] }
        ];
        
        console.log(`   Calling ${llmProvider || 'Gemini'} API. History length for LLM: ${fullHistoryForLLM.length}. System Prompt Used: ${!!systemPrompt}`);
        
        // For V1, we'll assume Gemini. Later, you can use llmProvider to switch services.
        aiResponseMessageText = await generateContentWithHistory(fullHistoryForLLM, systemPrompt);
        thinkingForAI += ` LLM call successful. Response generated.`;

<<<<<<< HEAD
        console.log(`   Calling Gemini API. History length for Gemini: ${finalHistoryForGemini.length}. System Prompt: ${!!systemPrompt}`);
        // console.log("   Final User Query Text (first 300 chars):", finalUserQueryText.substring(0, 300) + "...");

=======
>>>>>>> db12d8d6185be5fd3cae0eafb8a6e054e30dfd4a

        const aiMessageForDbAndClient = {
            // id: generated client-side
            sender: 'bot', // For frontend
            role: 'model', // For DB
            parts: [{ text: aiResponseMessageText }],
            text: aiResponseMessageText, // For frontend convenience
            timestamp: new Date(),
            thinking: thinkingForAI, // This is the "AI Reasoning"
            references: referencesForResponse,
            source_pipeline: actualSourcePipeline
        };

        // Save to MongoDB
        // Ensure messages in DB follow the MessageSchema (role, parts, timestamp)
        const dbUserMessage = { role: 'user', parts: userMessageForDb.parts, timestamp: userMessageForDb.timestamp };
        const dbAiMessage = { role: 'model', parts: aiMessageForDbAndClient.parts, timestamp: aiMessageForDbAndClient.timestamp, thinking: aiMessageForDbAndClient.thinking, references: aiMessageForDbAndClient.references, source_pipeline: aiMessageForDbAndClient.source_pipeline };


        await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { 
                $push: { messages: { $each: [dbUserMessage, dbAiMessage] } },
                $set: { updatedAt: new Date() } // Explicitly set updatedAt
            },
            { upsert: true, new: true, setDefaultsOnInsert: true } // upsert will create if not found
        );
        
        console.log(`<<< POST /api/chat/message successful for Session ${sessionId}.`);
        // Send the frontend-compatible message structure
        res.status(200).json({ reply: aiMessageForDbAndClient }); 

    } catch (error) {
<<<<<<< HEAD
        // ... (your existing error handling for this route) ...
        console.error(`!!! Error processing chat message for session ${sessionId}:`, error.message || error);
=======
        console.error(`!!! Error processing chat message for Session ${sessionId}:`, error);
>>>>>>> db12d8d6185be5fd3cae0eafb8a6e054e30dfd4a
        let statusCode = error.status || error.response?.status || 500;
        let clientMessage = error.message || error.response?.data?.message || "Failed to get response from AI service.";
        
        const errorMessageForChat = {
            sender: 'bot',
            role: 'model',
            parts: [{ text: `Error: ${clientMessage}` }],
            text: `Error: ${clientMessage}`,
            timestamp: new Date(),
            thinking: `Error occurred during processing: ${error.message}`,
            source_pipeline: 'error-pipeline'
        };
        
        // Attempt to save the user's message and this error message to history
        try {
            const dbUserMessageOnError = { role: 'user', parts: userMessageForDb.parts, timestamp: userMessageForDb.timestamp };
            const dbAiErrorMsg = { role: 'model', parts: errorMessageForChat.parts, timestamp: errorMessageForChat.timestamp, thinking: errorMessageForChat.thinking, source_pipeline: 'error-pipeline' };

            await ChatHistory.findOneAndUpdate(
                { sessionId: sessionId, userId: userId },
                { 
                    $push: { messages: { $each: [dbUserMessageOnError, dbAiErrorMsg] } },
                    $set: { updatedAt: new Date() }
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        } catch (dbError) {
            console.error(`!!! CRITICAL: Failed to save error message to chat history for Session ${sessionId}:`, dbError);
        }
        res.status(statusCode).json({ message: clientMessage, reply: errorMessageForChat });
    }
});

<<<<<<< HEAD
// --- @route   POST /api/chat/message ---
// router.post('/message', tempAuth, async (req, res) => {
//     // `relevantDocs` from client is an array of {documentName, content, score}
//     // `knowledge_graphs` would now also be part of the RAG step, but the Gemini prompt
//     // primarily uses `relevantDocs` for text context.
//     // The client might use `knowledge_graphs` for UI display.
//     const { message, history, sessionId, systemPrompt, isRagEnabled, relevantDocs /*, knowledge_graphs - client doesn't send KGs back here, it got them from /rag */ } = req.body;
//     const userId = req.user._id.toString();

//     // ... (rest of your existing /api/chat/message logic)
//     // The logic for constructing `contextString` from `relevantDocs` remains the same.
//     // The `knowledge_graphs` retrieved in the `/api/chat/rag` step are for the client to potentially use/display;
//     // they are not directly re-fed into the Gemini prompt in this `/message` endpoint unless you design it that way.

//     if (!message || typeof message !== 'string' || message.trim() === '') return res.status(400).json({ message: 'Message text required.' });
//     if (!sessionId || typeof sessionId !== 'string') return res.status(400).json({ message: 'Session ID required.' });
//     if (!Array.isArray(history)) return res.status(400).json({ message: 'Invalid history format.'});
//     const useRAG = !!isRagEnabled; 

//     console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${useRAG}. Query: "${message.substring(0,50)}..."`);

//     let contextString = "";
//     let citationHints = []; 

//     try {
//         if (useRAG && Array.isArray(relevantDocs) && relevantDocs.length > 0) {
//             console.log(`   RAG Enabled: Processing ${relevantDocs.length} relevant documents provided by client for context.`);
//             contextString = "Answer the user's question based primarily on the following context documents.\nIf the context documents do not contain the necessary information to answer the question fully, clearly state what information is missing from the context *before* potentially providing an answer based on your general knowledge.\n\n--- Context Documents ---\n";
            
//             relevantDocs.forEach((doc, index) => {
//                 if (!doc || typeof doc.documentName !== 'string' || typeof doc.content !== 'string') {
//                     console.warn("   Skipping invalid/incomplete document in relevantDocs (missing 'documentName' or 'content'):", doc);
//                     return; 
//                 }
//                 const docName = doc.documentName;
//                 const scoreDisplay = doc.score !== undefined ? `(Rel. Score: ${doc.score.toFixed(4)})` : ''; 
//                 const fullContent = doc.content; 

//                 contextString += `\n[${index + 1}] Source: ${docName} ${scoreDisplay}\nContent:\n${fullContent}\n---\n`;
//                 citationHints.push(`[${index + 1}] ${docName}`);
//             });
//             contextString += "\n--- End of Context ---\n\n";
//             console.log(`   Constructed context string. ${citationHints.length} valid docs used.`);
//         } else {
//             console.log(`   RAG Disabled or no relevant documents provided by client for context.`);
//         }

//         // ... (rest of your existing /api/chat/message logic for calling Gemini and sending response) ...
//         const historyForGeminiAPI = history.map(msg => ({
//              role: msg.role,
//              parts: msg.parts.map(part => ({ text: part.text || '' }))
//         })).filter(msg => msg && msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

//         let finalUserQueryText = "";
//         if (contextString) { 
//             const citationInstruction = `When referencing information ONLY from the context documents provided above, please cite the source using the format [Number] Document Name (e.g., ${citationHints.slice(0, Math.min(3, citationHints.length)).join(', ')}).`;
//             finalUserQueryText = `CONTEXT:\n${contextString}\nINSTRUCTIONS: ${citationInstruction}\n\nUSER QUESTION: ${message.trim()}`;
//         } else {
//             finalUserQueryText = message.trim();
//         }

//         const finalHistoryForGemini = [
//             ...historyForGeminiAPI,
//             { role: "user", parts: [{ text: finalUserQueryText }] }
//         ];

//         console.log(`   Calling Gemini API. History length for Gemini: ${finalHistoryForGemini.length}. System Prompt: ${!!systemPrompt}`);

//         const geminiResponseText = await generateContentWithHistory(finalHistoryForGemini, systemPrompt);

//         const modelResponseMessage = {
//             role: 'model',
//             parts: [{ text: geminiResponseText }],
//             timestamp: new Date()
//         };

//         console.log(`<<< POST /api/chat/message successful for session ${sessionId}.`);
//         res.status(200).json({ reply: modelResponseMessage });

//     } catch (error) {
//         console.error(`!!! Error processing chat message for session ${sessionId}:`, error.message || error);
//         let statusCode = error.status || error.response?.status || 500;
//         let clientMessage = error.message || error.response?.data?.message || "Failed to get response from AI service.";
        
//         if (statusCode === 500 && !error.response?.data?.message) { 
//             clientMessage = "An internal server error occurred while processing the AI response.";
//         }
//         res.status(statusCode).json({ message: clientMessage });
//     }
// });

// ... (rest of your chat.js: /history, /sessions, /session/:sessionId) ...
// --- @route POST /api/chat/history --- (Keep your existing implementation)
router.post('/history', tempAuth, async (req, res) => {
    const { sessionId, messages } = req.body;
    const userId = req.user._id; 
    if (!sessionId) return res.status(400).json({ message: 'Session ID required to save history.' });
    if (!Array.isArray(messages)) return res.status(400).json({ message: 'Invalid messages format.' });
=======
>>>>>>> db12d8d6185be5fd3cae0eafb8a6e054e30dfd4a

// --- @route   POST /api/chat/history ---
// --- @desc    Primarily for generating a new session ID for "New Chat" button.
// ---           Can also save an entire batch of messages if needed, but /message handles incremental.
// --- @access  Private ---
router.post('/history', async (req, res) => {
    const { sessionId, messages } = req.body; 
    const userId = req.user._id;

    // Case 1: Client requests a new session ID (typical for "New Chat")
    // This happens if sessionId is missing, or is a client-side temporary one,
    // or if messages are empty (indicating a fresh start).
    if (!sessionId || sessionId.startsWith('client-initiate-') || (Array.isArray(messages) && messages.length === 0)) {
        const newServerSessionId = uuidv4();
        console.log(`>>> POST /api/chat/history (New Session ID): User=${userId}. Client Temp SID: ${sessionId}. Generated New SID: ${newServerSessionId}`);
        // We don't create an empty ChatHistory document here.
        // The first call to /api/chat/message with this newServerSessionId will upsert it.
        return res.status(200).json({
            message: 'New session ID generated.',
            savedSessionId: null, 
            newSessionId: newServerSessionId // Key for the client
        });
    }

    // Case 2: Explicitly save a batch of messages for an existing session
    // This is less common for typical chat flow if /message saves incrementally.
    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: 'No valid messages provided to save for existing session.' });
    }
    
    console.log(`>>> POST /api/chat/history (Explicit Save): User=${userId}, Session=${sessionId}, Messages=${messages.length}`);
    try {
        // Validate and format messages for DB
        const validMessagesForDb = messages.filter(m =>
            m && typeof (m.sender === 'user' ? 'user' : 'model') === 'string' && // Check m.sender for role
            Array.isArray(m.parts) && m.parts.length > 0 &&
            typeof m.parts[0].text === 'string' &&
            m.timestamp
        ).map(m => ({
            role: m.sender === 'user' ? 'user' : 'model', // Convert sender to role
            parts: m.parts.map(p => ({ text: p.text || ''})), // Ensure parts structure
            timestamp: new Date(m.timestamp),
            thinking: m.thinking || undefined,
            references: m.references || undefined,
            source_pipeline: m.source_pipeline || undefined
        }));

        if (validMessagesForDb.length === 0) {
            return res.status(400).json({ message: 'No valid messages to save after filtering.' });
        }

        const savedHistory = await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { $set: { userId: userId, sessionId: sessionId, messages: validMessagesForDb, updatedAt: Date.now() } },
            { new: true, upsert: true, setDefaultsOnInsert: true } // Upsert ensures it creates if not found
        );
        
        console.log(`<<< POST /api/chat/history (Explicit Save): History saved for session ${savedHistory.sessionId}.`);
        res.status(200).json({
            message: 'Chat history explicitly saved successfully.',
            savedSessionId: savedHistory.sessionId,
            newSessionId: savedHistory.sessionId // Return same session ID
        });
    } catch (error) {
        console.error(`!!! Error explicitly saving chat history for session ${sessionId}:`, error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: "Validation Error: " + error.message });
        res.status(500).json({ message: 'Failed to save chat history due to a server error.' });
    }
});


// --- @route   GET /api/chat/sessions ---
// --- @desc    Get a list of user's past chat sessions ---
// --- @access  Private ---
router.get('/sessions', async (req, res) => {
    const userId = req.user._id;
    console.log(`>>> GET /api/chat/sessions: User=${userId}`);
    try {
        const sessions = await ChatHistory.find({ userId: userId })
            .sort({ updatedAt: -1 }) 
            .select('sessionId createdAt updatedAt messages') 
            .lean(); 

        const sessionSummaries = sessions.map(session => {
            const firstUserMessage = session.messages?.find(m => m.role === 'user');
            let preview = 'Chat Session';
            if (firstUserMessage?.parts?.[0]?.text) {
                preview = firstUserMessage.parts[0].text.substring(0, 75);
                if (firstUserMessage.parts[0].text.length > 75) preview += '...';
            } else if (session.messages?.length > 0 && session.messages[0]?.parts?.[0]?.text) {
                preview = session.messages[0].parts[0].text.substring(0,75) + (session.messages[0].parts[0].text.length > 75 ? "..." : "");
            }

            return {
                sessionId: session.sessionId,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                messageCount: session.messages?.length || 0,
                preview: preview
            };
        });
        console.log(`<<< GET /api/chat/sessions: Found ${sessionSummaries.length} sessions for User ${userId}.`);
        res.status(200).json(sessionSummaries);
    } catch (error) {
        console.error(`!!! Error fetching chat sessions for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat sessions.' });
    }
});


// --- @route   GET /api/chat/session/:sessionId ---
// --- @desc    Get all messages for a specific session ---
// --- @access  Private ---
router.get('/session/:sessionId', async (req, res) => {
    const userId = req.user._id;
    const { sessionId } = req.params;
    console.log(`>>> GET /api/chat/session/${sessionId}: User=${userId}`);

    if (!sessionId) {
        return res.status(400).json({ message: 'Session ID parameter is required.' });
    }

    try {
        const session = await ChatHistory.findOne({ sessionId: sessionId, userId: userId }).lean();
        if (!session) {
            console.log(`--- GET /api/chat/session/${sessionId}: Session not found for User ${userId}.`);
            return res.status(404).json({ message: 'Chat session not found or access denied.' });
        }
        console.log(`<<< GET /api/chat/session/${sessionId}: Session found for User ${userId}. Messages: ${session.messages?.length}`);
        // Transform messages to frontend format if necessary
        const messagesForFrontend = (session.messages || []).map(msg => ({
            id: msg._id || uuidv4(), // Mongoose subdocs don't have _id unless schema opts in
            sender: msg.role === 'model' ? 'bot' : 'user',
            text: msg.parts?.[0]?.text || '',
            thinking: msg.thinking,
            references: msg.references,
            timestamp: msg.timestamp,
            source_pipeline: msg.source_pipeline
        }));
        
        res.status(200).json({ ...session, messages: messagesForFrontend }); // Send modified session
    } catch (error) {
        console.error(`!!! Error fetching chat session ${sessionId} for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat session details.' });
    }
});

<<<<<<< HEAD
=======
// The /api/chat/rag endpoint seems to be for directly testing RAG,
// it's not directly part of the main chat flow if /message handles RAG internally.
// Keeping it as is if you use it for direct RAG testing.
router.post('/rag', async (req, res) => {
    const { message, filter } = req.body;
    const userId = req.user._id.toString();

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    console.log(`>>> POST /api/chat/rag (Direct Test): User=${userId}. Query: "${message.substring(0,50)}..."`);
    try {
        const kValue = parseInt(process.env.RAG_DEFAULT_K) || 5;
        const clientFilter = filter && typeof filter === 'object' ? filter : null;
        const relevantDocs = await queryPythonRagService(userId, message.trim(), kValue, clientFilter);
        console.log(`<<< POST /api/chat/rag successful for User ${userId}. Found ${relevantDocs.length} docs.`);
        res.status(200).json({ relevantDocs }); // Send back adapted docs
    } catch (error) {
        console.error(`!!! Error processing RAG query for User ${userId}:`, error.message);
        res.status(500).json({ message: error.message || "Failed to retrieve relevant documents." });
    }
});

>>>>>>> db12d8d6185be5fd3cae0eafb8a6e054e30dfd4a

module.exports = router;