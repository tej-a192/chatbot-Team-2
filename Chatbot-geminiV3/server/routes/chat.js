// server/routes/chat.js
const express = require('express');
const axios = require('axios');
const { tempAuth } = require('../middleware/authMiddleware');
const ChatHistory = require('../models/ChatHistory');
const { v4: uuidv4 } = require('uuid');
const { generateContentWithHistory } = require('../services/geminiService');

const router = express.Router();

// --- Helper to call Python RAG Query Endpoint ---
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
    }

    try {
        const response = await axios.post(searchUrl, payload, { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 
        });

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
        }
    } catch (error) {
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

        const finalHistoryForGemini = [
            ...historyForGeminiAPI,
            { role: "user", parts: [{ text: finalUserQueryText }] }
        ];

        console.log(`   Calling Gemini API. History length for Gemini: ${finalHistoryForGemini.length}. System Prompt: ${!!systemPrompt}`);
        // console.log("   Final User Query Text (first 300 chars):", finalUserQueryText.substring(0, 300) + "...");


        const geminiResponseText = await generateContentWithHistory(finalHistoryForGemini, systemPrompt);

        const modelResponseMessage = {
            role: 'model',
            parts: [{ text: geminiResponseText }],
            timestamp: new Date()
        };

        console.log(`<<< POST /api/chat/message successful for session ${sessionId}.`);
        res.status(200).json({ reply: modelResponseMessage });

    } catch (error) {
        // ... (your existing error handling for this route) ...
        console.error(`!!! Error processing chat message for session ${sessionId}:`, error.message || error);
        let statusCode = error.status || error.response?.status || 500;
        let clientMessage = error.message || error.response?.data?.message || "Failed to get response from AI service.";
        
        if (statusCode === 500 && !error.response?.data?.message) { 
            clientMessage = "An internal server error occurred while processing the AI response.";
        }
        res.status(statusCode).json({ message: clientMessage });
    }
});

// // --- @route   POST /api/chat/message ---
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

    console.log(`>>> POST /api/chat/history: User=${userId}, Session=${sessionId}, Messages=${messages.length}`);

    try {
        const validMessages = messages.filter(m =>
            m && typeof m.role === 'string' &&
            Array.isArray(m.parts) && m.parts.length > 0 &&
            typeof m.parts[0].text === 'string' &&
            m.timestamp 
        ).map(m => ({ 
            role: m.role,
            parts: [{ text: m.parts[0].text }], 
            timestamp: new Date(m.timestamp) 
        }));

        if (validMessages.length !== messages.length) {
             console.warn(`Session ${sessionId}: Filtered out ${messages.length - validMessages.length} invalid messages during save attempt.`);
        }
        if (validMessages.length === 0 && messages.length > 0) { 
            console.warn(`Session ${sessionId}: All ${messages.length} messages were invalid. No history saved.`);
            const newSessionIdForClient = uuidv4();
            return res.status(200).json({
                message: 'No valid messages to save. Chat not saved. New session ID provided.',
                savedSessionId: null,
                newSessionId: newSessionIdForClient
            });
        }
        if (validMessages.length === 0 && messages.length === 0) { 
             console.log(`Session ${sessionId}: No messages provided to save. Generating new session ID for client.`);
             const newSessionIdForClient = uuidv4();
             return res.status(200).json({
                 message: 'No history provided to save. New session ID for client.',
                 savedSessionId: null,
                 newSessionId: newSessionIdForClient
             });
        }

        const savedHistory = await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { $set: { userId: userId, sessionId: sessionId, messages: validMessages, updatedAt: Date.now() } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        const newClientSessionId = uuidv4(); 
        console.log(`<<< POST /api/chat/history: History saved for session ${savedHistory.sessionId}. New client session ID: ${newClientSessionId}`);
        res.status(200).json({
            message: 'Chat history saved successfully.',
            savedSessionId: savedHistory.sessionId,
            newSessionId: newClientSessionId 
        });
    } catch (error) {
        console.error(`!!! Error saving chat history for session ${sessionId}:`, error);
        if (error.name === 'ValidationError') return res.status(400).json({ message: "Validation Error saving history: " + error.message });
        if (error.code === 11000) return res.status(409).json({ message: "Conflict: Session ID might already exist unexpectedly." });
        res.status(500).json({ message: 'Failed to save chat history due to a server error.' });
    }
});

// --- @route GET /api/chat/sessions --- (Keep your existing implementation)
router.get('/sessions', tempAuth, async (req, res) => {
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
                 if (firstUserMessage.parts[0].text.length > 75) {
                     preview += '...';
                 }
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

// --- @route GET /api/chat/session/:sessionId --- (Keep your existing implementation)
router.get('/session/:sessionId', tempAuth, async (req, res) => {
    const userId = req.user._id;
    const { sessionId } = req.params;
    console.log(`>>> GET /api/chat/session/${sessionId}: User=${userId}`);
    if (!sessionId) return res.status(400).json({ message: 'Session ID parameter is required.' });
    try {
        const session = await ChatHistory.findOne({ sessionId: sessionId, userId: userId }).lean();
        if (!session) {
            console.log(`--- GET /api/chat/session/${sessionId}: Session not found for User ${userId}.`);
            return res.status(404).json({ message: 'Chat session not found or access denied.' });
        }
        console.log(`<<< GET /api/chat/session/${sessionId}: Session found for User ${userId}.`);
        res.status(200).json(session);
    } catch (error) {
        console.error(`!!! Error fetching chat session ${sessionId} for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat session details.' });
    }
});


module.exports = router;