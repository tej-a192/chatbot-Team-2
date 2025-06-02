// server/routes/chat.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const ChatHistory = require('../models/ChatHistory');
const { generateContentWithHistory } = require('../services/geminiService');
const axios = require('axios');

const router = express.Router();

// --- Helper to call Python RAG Query Endpoint ---
async function queryPythonRagService(userId, query, k = 5, filter = null) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set. RAG features disabled for this request.");
        return []; // Return empty if RAG is not configured, allowing fallback to direct LLM
    }
    const searchUrl = `${pythonServiceUrl}/query`;
    console.log(`Querying Python RAG: User ${userId}, Query (first 50): "${query.substring(0, 50)}...", k=${k}`);

    const payload = {
        query: query,
        k: k,
        user_id: userId // Ensure Python service expects 'user_id'
    };

    if (filter && typeof filter === 'object' && Object.keys(filter).length > 0) {
        payload.filter = filter;
        console.log(`  Applying filter to Python RAG search:`, filter);
    }

    try {
        const response = await axios.post(searchUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000 // 30 seconds
        });

        // Adapt this based on the exact structure of your Python RAG service's response
        if (response.data && Array.isArray(response.data.retrieved_documents_list)) {
            console.log(`Python RAG service /query returned ${response.data.retrieved_documents_list.length} results.`);
            return response.data.retrieved_documents_list.map(doc => ({
                documentName: doc.metadata?.original_name || doc.metadata?.file_name || doc.metadata?.title || 'Unknown Document',
                content: doc.page_content || "",
                score: doc.metadata?.score,
                // Include other relevant metadata from Python RAG if needed
            }));
        }
        console.warn(`Python RAG /query returned unexpected data structure:`, response.data);
        return [];
    } catch (error) {
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
    const { query, history, sessionId, useRag, llmProvider, useCriticalThinking, systemPrompt } = req.body;
    const userId = req.user._id; // From authMiddleware

    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: 'Session ID required.' });
    }
    if (!Array.isArray(history)) {
        return res.status(400).json({ message: 'Invalid history format.' });
    }

    const currentTimestamp = new Date();
    const userMessageForDb = {
        role: 'user',
        parts: [{ text: query.trim() }],
        timestamp: currentTimestamp
        // Note: 'id' for frontend display is generated client-side
    };

    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${useRag}. Query: "${query.substring(0, 50)}..."`);

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
                contextForLLM = "You are provided with context documents below. First, rely on the information in these documents to answer the question. If the context is insufficient, you may use your own external knowledge, but clearly indicate when you are doing so. Always provide a clear, step-by-step chain of thought in your answer.\n\n--- Context Documents ---\n";

                relevantDocsFromRag.forEach((doc, index) => {
                    contextForLLM += `\n[${index + 1}] Source: ${doc.documentName} (Score: ${doc.score ? doc.score.toFixed(3) : 'N/A'})\nContent:\n${doc.content}\n---\n`;
                    referencesForResponse.push({
                        number: index + 1,
                        source: doc.documentName,
                        content_preview: doc.content.substring(0, 100) + (doc.content.length > 100 ? "..." : "")
                    });
                });

                contextForLLM += "\n--- End of Context ---\n\nWhen referencing information ONLY from the context documents above, please cite the source using the format [Number] Document Name. If using your own knowledge due to insufficient context, state this clearly and provide your reasoning.\n\nUSER QUESTION: ";
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

        // Add current user query to history for the LLM call
        const fullHistoryForLLM = [
            ...historyForLLM,
            { role: 'user', parts: [{ text: queryForLLM }] }
        ];

        console.log(`   Calling ${llmProvider || 'Gemini'} API. History length for LLM: ${fullHistoryForLLM.length}. System Prompt Used: ${!!systemPrompt}`);

        // For V1, we'll assume Gemini. Later, you can use llmProvider to switch services.
        aiResponseMessageText = await generateContentWithHistory(fullHistoryForLLM, systemPrompt);
        thinkingForAI += ` LLM call successful. Response generated.`;


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
        console.error(`!!! Error processing chat message for Session ${sessionId}:`, error);
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
            parts: m.parts.map(p => ({ text: p.text || '' })), // Ensure parts structure
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
                preview = session.messages[0].parts[0].text.substring(0, 75) + (session.messages[0].parts[0].text.length > 75 ? "..." : "");
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

// The /api/chat/rag endpoint seems to be for directly testing RAG,
// it's not directly part of the main chat flow if /message handles RAG internally.
// Keeping it as is if you use it for direct RAG testing.
router.post('/rag', async (req, res) => {
    const { message, filter } = req.body;
    const userId = req.user._id.toString();

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    console.log(`>>> POST /api/chat/rag (Direct Test): User=${userId}. Query: "${message.substring(0, 50)}..."`);
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


module.exports = router;