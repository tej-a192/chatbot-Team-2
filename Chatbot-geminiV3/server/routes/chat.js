// server/routes/chat.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const ChatHistory = require('../models/ChatHistory');
const { generateContentWithHistory } = require('../services/geminiService');
const geminiService = require('../services/geminiService'); // Keep as geminiService
const ollamaService = require('../services/ollamaService'); // Import new Ollama service
const { CHAT_MAIN_SYSTEM_PROMPT, CHAT_USER_PROMPT_TEMPLATES } = require('../config/promptTemplates');
const axios = require('axios');

const router = express.Router();

// --- Helper to call Python RAG Query Endpoint ---
async function queryPythonRagService(
    userId,
    query,
    criticalThinkingEnabled, // boolean: for use_kg_critical_thinking
    documentContextNameToPass, // string: for documentContextName
    clientFilter = null, // object: for the generic 'filter'
    k = 5 // Default k value
) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set. RAG features disabled for this request.");
        return [];
    }
    const searchUrl = `${pythonServiceUrl}/query`;
    console.log(`Querying Python RAG: User ${userId}, Query (first 50): "${query.substring(0, 50)}...", k=${k}, CriticalThinking=${criticalThinkingEnabled}, DocContext=${documentContextNameToPass}`);

    const payload = {
        query: query,
        k: k,
        user_id: userId,
        use_kg_critical_thinking: !!criticalThinkingEnabled,
        documentContextName: documentContextNameToPass || null
    };

    if (clientFilter && typeof clientFilter === 'object' && Object.keys(clientFilter).length > 0) {
        payload.filter = clientFilter;
        console.log(`  Applying generic filter to Python RAG search:`, clientFilter);
    } else {
        console.log(`  No generic client filter applied to Python RAG search.`);
    }

    try {
        const response = await axios.post(searchUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: process.env.PYTHON_RAG_TIMEOUT || 30000
        });

        if (response.data && Array.isArray(response.data.retrieved_documents_list)) {
            console.log(`Python RAG service /query returned ${response.data.retrieved_documents_list.length} results.`);
            return response.data.retrieved_documents_list.map(doc => ({
                documentName: doc.metadata?.file_name || doc.metadata?.original_name || doc.metadata?.title || 'Unknown Document',
                content: doc.page_content || "",
                score: doc.metadata?.score,
            }));
        }
        console.warn(`Python RAG /query returned unexpected data structure:`, response.data);
        return [];
    } catch (error) {
        let errorMsg = error.message;
        if (error.response?.data?.error) {
            errorMsg = `Python Service Error: ${error.response.data.error}`;
            if (error.response.data.details) {
                errorMsg += ` | Details: ${JSON.stringify(error.response.data.details)}`;
            }
        } else if (error.code === 'ECONNABORTED') {
            errorMsg = 'Python RAG service request timed out.';
        }
        console.error(`Error querying Python RAG service at ${searchUrl}:`, errorMsg);
        return []; 
    }
}


// --- @route   POST /api/chat/message ---
// --- @desc    Send a message, get AI response, save interaction ---
// --- @access  Private (authMiddleware applied in server.js) ---
router.post('/message', async (req, res) => {
    const { 
        query, 
        // =================================================================
        // >>>>>>>>>> FIX #1: Provide a default empty array for history <<<<<<<<<<
        // This prevents the '.map is not a function' error on new chats.
        // =================================================================
        history = [], 
        sessionId, 
        useRag, 
        llmProvider, 
        systemPrompt: clientProvidedSystemInstruction,
        criticalThinkingEnabled, 
        documentContextName,
        filter
    } = req.body;
    const userId = req.user._id; 

    // --- Validations ---
    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: 'Session ID required.' });
    }
    // No need to validate history anymore since we provide a default
    // ... other validations ...


    // =================================================================
    // >>>>>>>>>> FIX #2: Properly create the user message object <<<<<<<<<<
    // This ensures the user's message is correctly saved to the DB.
    // =================================================================
    const userMessageForDb = {
        role: 'user',
        parts: [{ text: query }],
        timestamp: new Date()
    };

    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${useRag}, CriticalThinking=${criticalThinkingEnabled}, DocContext=${documentContextName}, ClientFilter=${!!filter}, Query: "${query.substring(0,50)}..."`);

    try {
        let aiResponseMessageText;
        let referencesForResponse = [];
        let actualSourcePipeline = `${llmProvider || 'gemini'}-direct`;
        let contextForLLMString = "";
        let relevantDocsFromRag = [];
        const mainSystemPromptText = CHAT_MAIN_SYSTEM_PROMPT ? CHAT_MAIN_SYSTEM_PROMPT() : ""; 

        if (useRag) {
            actualSourcePipeline = `${llmProvider || 'gemini'}-rag`;
            console.log(`   Querying RAG service for user ${userId}, query "${query.trim()}", criticalThinking: ${criticalThinkingEnabled}, docContext: ${documentContextName}, clientFilter: ${JSON.stringify(filter)}`);
            
            relevantDocsFromRag = await queryPythonRagService(
                userId.toString(), 
                query.trim(), 
                criticalThinkingEnabled,
                documentContextName,
                filter
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
            }
        }

        // This part is now safe because `history` is guaranteed to be an array.
        const historyForLLM = history
            .map(msg => ({
                role: msg.sender === 'bot' ? 'model' : 'user',
                parts: msg.parts && Array.isArray(msg.parts) ? msg.parts.map(part => ({ text: part.text || '' })) : [{ text: msg.text || '' }]
            }))
            .filter(msg => msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

        let queryForLLM;
        if (useRag && contextForLLMString) {
            queryForLLM = CHAT_USER_PROMPT_TEMPLATES.rag(query.trim(), contextForLLMString, clientProvidedSystemInstruction);
        } else {
            queryForLLM = CHAT_USER_PROMPT_TEMPLATES.direct(query.trim(), clientProvidedSystemInstruction);
        }
        
        const fullHistoryForLLM = [
            ...historyForLLM,
            { role: 'user', parts: [{ text: queryForLLM }] }
        ];
        
        console.log(`   Calling ${llmProvider || 'Gemini'} API. History length for LLM: ${fullHistoryForLLM.length}.`);
        
        if (llmProvider === 'ollama') {
            aiResponseMessageText = await ollamaService.generateContentWithHistory(
                fullHistoryForLLM,
                mainSystemPromptText
            );
        } else {
            aiResponseMessageText = await geminiService.generateContentWithHistory(
                fullHistoryForLLM,
                mainSystemPromptText
            );
        }

        const aiMessageForDbAndClient = {
            sender: 'bot',
            role: 'model',
            parts: [{ text: aiResponseMessageText }],
            text: aiResponseMessageText,
            timestamp: new Date(),
            thinking: null, 
            references: referencesForResponse,
            source_pipeline: actualSourcePipeline,
            critical_thinking_applied_details: useRag && criticalThinkingEnabled && relevantDocsFromRag.length > 0 ? "KG-enhanced RAG" : (criticalThinkingEnabled ? "Requested, not RAG/KG path" : "Not requested")
        };

        // This part is now safe because `userMessageForDb` is correctly populated.
        const dbUserMessageForSave = { role: 'user', parts: userMessageForDb.parts, timestamp: userMessageForDb.timestamp };
        const dbAiMessageForSave = { 
            role: 'model', 
            parts: aiMessageForDbAndClient.parts, 
            timestamp: aiMessageForDbAndClient.timestamp, 
            thinking: aiMessageForDbAndClient.thinking, 
            references: aiMessageForDbAndClient.references, 
            source_pipeline: aiMessageForDbAndClient.source_pipeline,
            critical_thinking_requested: !!criticalThinkingEnabled 
        };

        await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            {
                $push: { messages: { $each: [dbUserMessageForSave, dbAiMessageForSave] } },
                $set: { updatedAt: new Date() } 
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`<<< POST /api/chat/message successful for Session ${sessionId}.`);
        res.status(200).json({ reply: aiMessageForDbAndClient }); 

    } catch (error) {
        console.error(`!!! Error processing chat message for Session ${sessionId}:`, error);
        let statusCode = error.status || error.response?.status || 500;
        let clientMessage = error.message || "Failed to get response from AI service.";
        
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
            // This part is now safe because `userMessageForDb` is correctly populated.
            const dbUserMessageOnError = { role: 'user', parts: userMessageForDb.parts, timestamp: userMessageForDb.timestamp };
            const dbAiErrorMsg = { 
                role: 'model', 
                parts: errorMessageForChat.parts, 
                timestamp: errorMessageForChat.timestamp, 
                thinking: errorMessageForChat.thinking,
                references: errorMessageForChat.references, 
                source_pipeline: errorMessageForChat.source_pipeline,
                critical_thinking_requested: !!criticalThinkingEnabled
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
// ... (rest of the file remains the same and looks correct)
router.post('/history', async (req, res) => {
    const { sessionId, messages } = req.body; 
    const userId = req.user._id;

    if (!sessionId || sessionId.startsWith('client-initiate-') || (Array.isArray(messages) && messages.length === 0)) {
        const newServerSessionId = uuidv4();
        console.log(`>>> POST /api/chat/history (New Session ID): User=${userId}. Generated New SID: ${newServerSessionId}`);
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
        const validMessagesForDb = messages.map(m => ({
            role: m.sender === 'user' ? 'user' : 'model',
            parts: m.parts.map(p => ({ text: p.text || ''})),
            timestamp: new Date(m.timestamp),
            thinking: m.thinking || undefined,
            references: m.references || undefined,
            source_pipeline: m.source_pipeline || undefined
        })).filter(Boolean);

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
        res.status(500).json({ message: 'Failed to save chat history due to a server error.' });
    }
});


// --- @route   GET /api/chat/sessions ---
// ... (rest of the file remains the same and looks correct)
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
            let preview = firstUserMessage?.parts?.[0]?.text?.substring(0, 75) || 'Chat Session';
            if (preview.length === 75) preview += '...';
            
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
// ... (rest of the file remains the same and looks correct)
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
        
        const messagesForFrontend = (session.messages || []).map(msg => ({
            id: msg._id || uuidv4(),
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
// ... (rest of the file remains the same and looks correct)
router.post('/rag', async (req, res) => {
    // ...
});

module.exports = router;