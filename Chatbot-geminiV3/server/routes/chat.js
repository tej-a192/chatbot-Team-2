// server/routes/chat.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const ChatHistory = require('../models/ChatHistory');
const { generateContentWithHistory } = require('../services/geminiService');
// Import CHAT_MAIN_SYSTEM_PROMPT which no longer mandates <thinking> output
const { CHAT_MAIN_SYSTEM_PROMPT, CHAT_USER_PROMPT_TEMPLATES } = require('../config/promptTemplates');
const axios = require('axios');

const router = express.Router();

// --- Helper to call Python RAG Query Endpoint ---
async function queryPythonRagService(userId, query, k = 5, filter = null) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set. RAG features disabled for this request.");
        return [];
    }
    const searchUrl = `${pythonServiceUrl}/query`;
    console.log(`Querying Python RAG: User ${userId}, Query (first 50): "${query.substring(0, 50)}...", k=${k}`);

    const payload = {
        query: query,
        k: k,
        user_id: userId
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

        if (response.data && Array.isArray(response.data.retrieved_documents_list)) {
            console.log(`Python RAG service /query returned ${response.data.retrieved_documents_list.length} results.`);
            return response.data.retrieved_documents_list.map(doc => ({
                documentName: doc.metadata?.original_name || doc.metadata?.file_name || doc.metadata?.title || 'Unknown Document',
                content: doc.page_content || "",
                score: doc.metadata?.score,
            }));
        }
        console.warn(`Python RAG /query returned unexpected data structure:`, response.data);
        return [];
    } catch (error) {
        console.error(`Error querying Python RAG service at ${searchUrl}:`, error.message);
        return []; 
    }
}


// --- @route   POST /api/chat/message ---
// --- @desc    Send a message, get AI response, save interaction ---
// --- @access  Private (authMiddleware applied in server.js) ---
router.post('/message', async (req, res) => {
    // Destructure criticalThinkingEnabled from req.body
    const { 
        query, 
        history, 
        sessionId, 
        useRag, 
        llmProvider, 
        systemPrompt: clientProvidedSystemInstruction,
        criticalThinkingEnabled // <<< NEWLY ADDED for receiving from frontend
    } = req.body;
    const userId = req.user._id; 

    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: 'Session ID required.' });
    }
    if (!Array.isArray(history)) {
        return res.status(400).json({ message: 'Invalid history format.' });
    }
    // Optional: Validate criticalThinkingEnabled
    if (criticalThinkingEnabled !== undefined && typeof criticalThinkingEnabled !== 'boolean') {
        return res.status(400).json({ message: 'Invalid criticalThinkingEnabled value. Must be a boolean.' });
    }


    const currentTimestamp = new Date();
    const userMessageForDb = {
        role: 'user',
        parts: [{ text: query.trim() }],
        timestamp: currentTimestamp
    };

    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${useRag}, CriticalThinking=${criticalThinkingEnabled}, ClientSystemInstruction: ${!!clientProvidedSystemInstruction}. Query: "${query.substring(0,50)}..."`);

    try {
        let aiResponseMessageText;
        let referencesForResponse = [];
        let actualSourcePipeline = `${llmProvider || 'gemini'}-direct`;
        
        let contextForLLMString = "";
        let relevantDocsFromRag = [];

        // Assume CHAT_MAIN_SYSTEM_PROMPT() and CHAT_USER_PROMPT_TEMPLATES are defined elsewhere
        const mainSystemPromptText = CHAT_MAIN_SYSTEM_PROMPT ? CHAT_MAIN_SYSTEM_PROMPT() : ""; 

        if (useRag) {
            actualSourcePipeline = `${llmProvider || 'gemini'}-rag`;
            console.log(`   Querying RAG service for user ${userId}, query "${query.trim()}", criticalThinking: ${criticalThinkingEnabled}`);
            // MODIFIED: Pass criticalThinkingEnabled to the RAG service query
            // The queryPythonRagService function itself needs to be adapted to handle this new parameter.
            relevantDocsFromRag = await queryPythonRagService(
                userId.toString(), 
                query.trim(), 
                criticalThinkingEnabled // <<< PASSING THE VALUE
            );

            if (relevantDocsFromRag && relevantDocsFromRag.length > 0) {
                let ragContextForPromptAssembly = "";
                relevantDocsFromRag.forEach((doc, index) => {
                    ragContextForPromptAssembly += `\n[${index + 1}] Source Document: ${doc.documentName}\n(Score: ${doc.score ? doc.score.toFixed(3) : 'N/A'})\nContent:\n${doc.content}\n---\n`;
                    referencesForResponse.push({
                        number: index + 1,
                        source: doc.documentName,
                        content_preview: doc.content.substring(0, 100) + (doc.content.length > 100 ? "..." : "")
                    });
                });
                contextForLLMString = ragContextForPromptAssembly.trim();
            } else {
                contextForLLMString = ""; 
            }
        }

        const historyForLLM = history
            .map(msg => ({
                role: msg.sender === 'bot' ? 'model' : 'user',
                parts: msg.parts && Array.isArray(msg.parts) ? msg.parts.map(part => ({ text: part.text || '' })) : [{ text: msg.text || '' }]
            }))
            .filter(msg => msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

        let queryForLLM;
        // Assume CHAT_USER_PROMPT_TEMPLATES.rag and .direct are defined elsewhere
        if (useRag && contextForLLMString) {
            queryForLLM = CHAT_USER_PROMPT_TEMPLATES.rag(query.trim(), contextForLLMString, clientProvidedSystemInstruction);
        } else {
            queryForLLM = CHAT_USER_PROMPT_TEMPLATES.direct(query.trim(), clientProvidedSystemInstruction);
        }
        
        const fullHistoryForLLM = [
            ...historyForLLM,
            { role: 'user', parts: [{ text: queryForLLM }] }
        ];
        
        console.log(`   Calling ${llmProvider || 'Gemini'} API. History length for LLM: ${fullHistoryForLLM.length}. System Prompt Used: ${!!mainSystemPromptText}. Query for LLM (first 150 chars): ${queryForLLM.substring(0,150)}...`);
        
        // Assume generateContentWithHistory is defined elsewhere
        aiResponseMessageText = await generateContentWithHistory(fullHistoryForLLM, mainSystemPromptText);
        
        const aiMessageForDbAndClient = {
            sender: 'bot',
            role: 'model',
            parts: [{ text: aiResponseMessageText }],
            text: aiResponseMessageText,
            timestamp: new Date(),
            thinking: null, 
            references: referencesForResponse,
            source_pipeline: actualSourcePipeline,
            // Optionally, include a flag indicating if critical thinking was applied based on RAG results
            critical_thinking_applied_details: useRag && criticalThinkingEnabled && relevantDocsFromRag.length > 0 ? "KG-enhanced RAG" : (criticalThinkingEnabled ? "Requested, not RAG/KG path" : "Not requested")
        };

        const dbUserMessage = { role: 'user', parts: userMessageForDb.parts, timestamp: userMessageForDb.timestamp };
        const dbAiMessage = { 
            role: 'model', 
            parts: aiMessageForDbAndClient.parts, 
            timestamp: aiMessageForDbAndClient.timestamp, 
            thinking: aiMessageForDbAndClient.thinking, 
            references: aiMessageForDbAndClient.references, 
            source_pipeline: aiMessageForDbAndClient.source_pipeline,
            critical_thinking_requested: !!criticalThinkingEnabled // Store boolean in DB
        };

        await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            {
                $push: { messages: { $each: [dbUserMessage, dbAiMessage] } },
                $set: { updatedAt: new Date() } 
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`<<< POST /api/chat/message successful for Session ${sessionId}.`);
        res.status(200).json({ reply: aiMessageForDbAndClient }); 

    } catch (error) {
        console.error(`!!! Error processing chat message for Session ${sessionId} (RAG: ${useRag}, CriticalThinking: ${criticalThinkingEnabled}):`, error);
        let statusCode = error.status || error.response?.status || 500;
        let clientMessage = error.message || error.response?.data?.message || "Failed to get response from AI service.";

        const errorMessageForChat = {
            sender: 'bot',
            role: 'model',
            parts: [{ text: `Error: ${clientMessage}` }],
            text: `Error: ${clientMessage}`,
            timestamp: new Date(),
            thinking: `Error occurred during processing: ${error.message}`, 
            references: [],
            source_pipeline: 'error-pipeline'
        };
        
        try {
            const dbUserMessageOnError = { role: 'user', parts: userMessageForDb.parts, timestamp: userMessageForDb.timestamp };
            const dbAiErrorMsg = { 
                role: 'model', 
                parts: errorMessageForChat.parts, 
                timestamp: errorMessageForChat.timestamp, 
                thinking: errorMessageForChat.thinking,
                references: errorMessageForChat.references, 
                source_pipeline: errorMessageForChat.source_pipeline,
                critical_thinking_requested: !!criticalThinkingEnabled // Store boolean in DB even on error
            };

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
// ... (rest of the file remains the same as your last provided version)
// --- @desc    Primarily for generating a new session ID for "New Chat" button.
// ---           Can also save an entire batch of messages if needed, but /message handles incremental.
// --- @access  Private ---
router.post('/history', async (req, res) => {
    const { sessionId, messages } = req.body;
    const userId = req.user._id;

    if (!sessionId || sessionId.startsWith('client-initiate-') || (Array.isArray(messages) && messages.length === 0)) {
        const newServerSessionId = uuidv4();
        console.log(`>>> POST /api/chat/history (New Session ID): User=${userId}. Client Temp SID: ${sessionId}. Generated New SID: ${newServerSessionId}`);
        return res.status(200).json({
            message: 'New session ID generated.',
            savedSessionId: null, 
            newSessionId: newServerSessionId 
        });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: 'No valid messages provided to save for existing session.' });
    }

    console.log(`>>> POST /api/chat/history (Explicit Save): User=${userId}, Session=${sessionId}, Messages=${messages.length}`);
    try {
        const validMessagesForDb = messages.filter(m =>
            m && typeof (m.sender === 'user' ? 'user' : (m.sender === 'bot' ? 'model' : undefined)) === 'string' &&
            Array.isArray(m.parts) && m.parts.length > 0 &&
            typeof m.parts[0].text === 'string' &&
            m.timestamp
        ).map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: m.parts.map(p => ({ text: p.text || ''})),
            timestamp: new Date(m.timestamp),
            thinking: m.thinking || null, 
            references: m.references || [], 
            source_pipeline: m.source_pipeline || undefined
        }));

        if (validMessagesForDb.length === 0) {
            return res.status(400).json({ message: 'No valid messages to save after filtering.' });
        }

        const savedHistory = await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { $set: { userId: userId, sessionId: sessionId, messages: validMessagesForDb, updatedAt: Date.now() } },
            { new: true, upsert: true, setDefaultsOnInsert: true } 
        );

        console.log(`<<< POST /api/chat/history (Explicit Save): History saved for session ${savedHistory.sessionId}.`);
        res.status(200).json({
            message: 'Chat history explicitly saved successfully.',
            savedSessionId: savedHistory.sessionId,
            newSessionId: savedHistory.sessionId
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
        
        const messagesForFrontend = (session.messages || []).map(msg => ({
            id: msg._id?.toString() || uuidv4(),
            sender: msg.role === 'model' ? 'bot' : 'user',
            text: msg.parts?.[0]?.text || '',
            thinking: msg.thinking, 
            references: msg.references, 
            timestamp: msg.timestamp,
            source_pipeline: msg.source_pipeline
        }));
        
        res.status(200).json({ ...session, messages: messagesForFrontend });
    } catch (error) {
        console.error(`!!! Error fetching chat session ${sessionId} for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat session details.' });
    }
});

// --- @route   POST /api/chat/rag ---
// --- @desc    Directly test RAG (not part of main chat flow if /message handles RAG) ---
// --- @access  Private ---
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
        res.status(200).json({ relevantDocs }); 
    } catch (error) {
        console.error(`!!! Error processing RAG query for User ${userId}:`, error.message);
        res.status(500).json({ message: error.message || "Failed to retrieve relevant documents." });
    }
});


module.exports = router;