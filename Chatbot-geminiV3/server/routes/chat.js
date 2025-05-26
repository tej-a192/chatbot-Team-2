// server/routes/chat.js
const express = require('express');
const axios = require('axios');
const { tempAuth } = require('../middleware/authMiddleware');
const ChatHistory = require('../models/ChatHistory');
const { v4: uuidv4 } = require('uuid');
const { generateContentWithHistory } = require('../services/geminiService');

const router = express.Router();

// --- Helper to call Python RAG Query Endpoint ---
async function queryPythonRagService(userId, query, k = 5, filter = null) { // Added filter parameter
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set in environment. Cannot query RAG service.");
        throw new Error("RAG service configuration error."); // Throw error to be caught by caller
    }
    const searchUrl = `${pythonServiceUrl}/query`; // <<<--- CORRECTED TO /query ---

    console.log(`Querying Python RAG service for User ${userId} at ${searchUrl} with query (first 50): "${query.substring(0,50)}...", k=${k}`);
    
    const payload = {
        query: query,
        k: k
    };

    if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) {
        payload.filter = filter;
        console.log(`  Applying filter to Python RAG search:`, filter);
    } else {
        console.log(`  No filter applied to Python RAG search.`);
    }

    try {
        const response = await axios.post(searchUrl, payload, { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 
        });

        // Python /search returns: { ..., retrieved_documents_list: [{ page_content: "...", metadata: {...} }], ... }
        if (response.data && Array.isArray(response.data.retrieved_documents_list)) {
            console.log(`Python RAG service /search returned ${response.data.results_count} results.`);
            
            // Adapt to the structure expected by the Node.js /api/chat/rag and /api/chat/message routes
            const adaptedDocs = response.data.retrieved_documents_list.map(doc => {
                const metadata = doc.metadata || {};
                return {
                    // The /api/chat/message route expects 'documentName' and 'content'
                    documentName: metadata.original_name || metadata.file_name || metadata.title || 'Unknown Document',
                    content: doc.page_content || "", 
                    score: metadata.score, // Pass along the score
                    // Include any other metadata if needed by the Gemini prompt construction
                    // e.g., page_chunk_info: metadata.page_chunk_info || metadata.chunk_index,
                    // e.g., qdrant_id: metadata.qdrant_id 
                };
            });
            
            console.log(`  Adapted ${adaptedDocs.length} documents for Node.js service.`);
            return adaptedDocs; 

        } else {
             console.warn(`Python RAG service /search returned unexpected data structure:`, response.data);
             // Throw an error or return empty if the structure is critical
             throw new Error("Received unexpected data structure from RAG search service.");
        }
    } catch (error) {
        const errorStatus = error.response?.status;
        const errorData = error.response?.data;
        let errorMsg = "Unknown RAG search error";

        if (errorData) {
            if (typeof errorData === 'string' && errorData.toLowerCase().includes("<!doctype html>")) {
                errorMsg = `HTML error page received from Python RAG service (Status: ${errorStatus}). URL (${searchUrl}) might be incorrect or Python service has an issue.`;
                console.error(`Error querying Python RAG service: Received HTML error page. URL: ${searchUrl}, Status: ${errorStatus}`);
            } else {
                errorMsg = errorData?.error || error.message || "Error response from RAG service had no specific message.";
                console.error(`Error querying Python RAG service at ${searchUrl}. Status: ${errorStatus}, Python Error: ${errorMsg}`, errorData);
            }
        } else if (error.request) {
            errorMsg = `No response received from Python RAG service at ${searchUrl}. It might be down or unreachable.`;
            console.error(`Error querying Python RAG service at ${searchUrl}: No response received. ${error.message}`);
        } else {
            errorMsg = error.message;
            console.error(`Error setting up or sending request to Python RAG service at ${searchUrl}: ${error.message}`);
        }
        throw new Error(`RAG Search Failed: ${errorMsg}`); // Propagate error
    }
}

// --- @route   POST /api/chat/rag ---
router.post('/rag', tempAuth, async (req, res) => {
    const { message, filter } = req.body; 
    const userId = req.user._id.toString(); 

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }

    console.log(`>>> POST /api/chat/rag: User=${userId}. Query: "${message.substring(0,50)}..."`);

    try {
        const kValue = parseInt(process.env.RAG_DEFAULT_K) || 5; 
        const clientFilter = filter && typeof filter === 'object' ? filter : null; 
        
        const relevantDocs = await queryPythonRagService(userId, message.trim(), kValue, clientFilter); 
        
        console.log(`<<< POST /api/chat/rag successful for User ${userId}. Found ${relevantDocs.length} docs.`);
        res.status(200).json({ relevantDocs }); // `relevantDocs` is now an array of { documentName, content, score }

    } catch (error) { 
        console.error(`!!! Error processing RAG query for User ${userId}:`, error.message);
        res.status(500).json({ message: error.message || "Failed to retrieve relevant documents." });
    }
});

// --- @route   POST /api/chat/message ---
// (This route should now work correctly with the adapted `relevantDocs` structure)
router.post('/message', tempAuth, async (req, res) => {
    const { message, history, sessionId, systemPrompt, isRagEnabled, relevantDocs } = req.body;
    const userId = req.user._id.toString(); 

    if (!message || typeof message !== 'string' || message.trim() === '') return res.status(400).json({ message: 'Message text required.' });
    if (!sessionId || typeof sessionId !== 'string') return res.status(400).json({ message: 'Session ID required.' });
    if (!Array.isArray(history)) return res.status(400).json({ message: 'Invalid history format.'});
    const useRAG = !!isRagEnabled; 

    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${useRAG}. Query: "${message.substring(0,50)}..."`);

    let contextString = "";
    let citationHints = []; 

    try {
        // `relevantDocs` is now an array of {documentName, content, score} from queryPythonRagService
        if (useRAG && Array.isArray(relevantDocs) && relevantDocs.length > 0) {
            console.log(`   RAG Enabled: Processing ${relevantDocs.length} relevant documents provided by client.`);
            contextString = "Answer the user's question based primarily on the following context documents.\nIf the context documents do not contain the necessary information to answer the question fully, clearly state what information is missing from the context *before* potentially providing an answer based on your general knowledge.\n\n--- Context Documents ---\n";
            
            relevantDocs.forEach((doc, index) => {
                if (!doc || typeof doc.documentName !== 'string' || typeof doc.content !== 'string') {
                    console.warn("   Skipping invalid/incomplete document in relevantDocs (missing 'documentName' or 'content'):", doc);
                    return; 
                }
                const docName = doc.documentName;
                const scoreDisplay = doc.score !== undefined ? `(Rel. Score: ${doc.score.toFixed(4)})` : ''; 
                const fullContent = doc.content; 

                contextString += `\n[${index + 1}] Source: ${docName} ${scoreDisplay}\nContent:\n${fullContent}\n---\n`;
                citationHints.push(`[${index + 1}] ${docName}`);
            });
            contextString += "\n--- End of Context ---\n\n";
            console.log(`   Constructed context string. ${citationHints.length} valid docs used.`);
        } else {
            console.log(`   RAG Disabled or no relevant documents provided by client.`);
        }

        const historyForGeminiAPI = history.map(msg => ({
             role: msg.role,
             parts: msg.parts.map(part => ({ text: part.text || '' }))
        })).filter(msg => msg && msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

        let finalUserQueryText = "";
        if (contextString) { 
            const citationInstruction = `When referencing information ONLY from the context documents provided above, please cite the source using the format [Number] Document Name (e.g., ${citationHints.slice(0, Math.min(3, citationHints.length)).join(', ')}).`;
            finalUserQueryText = `CONTEXT:\n${contextString}\nINSTRUCTIONS: ${citationInstruction}\n\nUSER QUESTION: ${message.trim()}`;
        } else {
            finalUserQueryText = message.trim();
        }

        const finalHistoryForGemini = [
            ...historyForGeminiAPI,
            { role: "user", parts: [{ text: finalUserQueryText }] }
        ];

        console.log(`   Calling Gemini API. History length for Gemini: ${finalHistoryForGemini.length}. System Prompt: ${!!systemPrompt}`);

        const geminiResponseText = await generateContentWithHistory(finalHistoryForGemini, systemPrompt);

        const modelResponseMessage = {
            role: 'model',
            parts: [{ text: geminiResponseText }],
            timestamp: new Date()
        };

        console.log(`<<< POST /api/chat/message successful for session ${sessionId}.`);
        res.status(200).json({ reply: modelResponseMessage });

    } catch (error) {
        console.error(`!!! Error processing chat message for session ${sessionId}:`, error);
        let statusCode = error.status || error.response?.status || 500;
        let clientMessage = error.message || error.response?.data?.message || "Failed to get response from AI service.";
        
        if (statusCode === 500 && !error.response?.data?.message) { 
            clientMessage = "An internal server error occurred while processing the AI response.";
        }
        res.status(statusCode).json({ message: clientMessage });
    }
});

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