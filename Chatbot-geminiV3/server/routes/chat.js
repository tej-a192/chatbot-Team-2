// server/routes/chat.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const ChatHistory = require('../models/ChatHistory');
const User = require('../models/User'); // Import User model
const { generateContentWithHistory } = require('../services/geminiService');
const geminiService = require('../services/geminiService');
const ollamaService = require('../services/ollamaService');
const { CHAT_MAIN_SYSTEM_PROMPT, CHAT_USER_PROMPT_TEMPLATES } = require('../config/promptTemplates');
const { createOrUpdateSummary } = require('../services/summarizationService');
const axios = require('axios');

const router = express.Router();

// --- Helper to call Python RAG Query Endpoint ---
async function queryPythonRagService(
    userId, query, criticalThinkingEnabled, documentContextNameToPass, clientFilter = null, k = 5
) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set. RAG features disabled for this request.");
        return [];
    }
    const searchUrl = `${pythonServiceUrl}/query`;
    console.log(`Querying Python RAG: User ${userId}, Query (first 50): "${query.substring(0, 50)}...", k=${k}, CriticalThinking=${criticalThinkingEnabled}, DocContext=${documentContextNameToPass}`);

    const payload = {
        query: query, k: k, user_id: userId,
        use_kg_critical_thinking: !!criticalThinkingEnabled,
        documentContextName: documentContextNameToPass || null
    };
    if (clientFilter && typeof clientFilter === 'object' && Object.keys(clientFilter).length > 0) {
        payload.filter = clientFilter;
    }

    try {
        const response = await axios.post(searchUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: process.env.PYTHON_RAG_TIMEOUT || 30000
        });
        if (response.data && Array.isArray(response.data.retrieved_documents_list)) {
            return response.data.retrieved_documents_list.map(doc => ({
                documentName: doc.metadata?.file_name || doc.metadata?.original_name || doc.metadata?.title || 'Unknown Document',
                content: doc.page_content || "", score: doc.metadata?.score,
            }));
        }
        return [];
    } catch (error) {
        let errorMsg = error.message;
        if (error.response?.data?.error) errorMsg = `Python Service Error: ${error.response.data.error}`;
        else if (error.code === 'ECONNABORTED') errorMsg = 'Python RAG service request timed out.';
        console.error(`Error querying Python RAG service at ${searchUrl}:`, errorMsg);
        return [];
    }
}


// --- @route   POST /api/chat/message ---
// --- @desc    Send a message, get AI response, save interaction ---
// --- @access  Private ---
router.post('/message', async (req, res) => {
    const {
        query, sessionId, useRag, llmProvider: clientLlmProvider,
        systemPrompt: clientProvidedSystemInstruction, criticalThinkingEnabled,
        documentContextName, filter
    } = req.body;
    const userId = req.user._id;

    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: 'Session ID required.' });
    }

    const userMessageForDb = { role: 'user', parts: [{ text: query }], timestamp: new Date() };
    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${useRag}, Query: "${query.substring(0, 50)}..."`);

    try {
        // 1. FETCH AUTHORITATIVE STATE FROM DB
        const [chatSession, user] = await Promise.all([
            ChatHistory.findOne({ sessionId: sessionId, userId: userId }),
            User.findById(userId).select('preferredLlmProvider ollamaModel').lean()
        ]);
        const llmProvider = user?.preferredLlmProvider || clientLlmProvider || 'gemini';
        const ollamaModel = user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL;

        const historyFromDb = chatSession ? chatSession.messages : [];
        const summaryFromDb = chatSession ? chatSession.summary || "" : "";

        // 2. PREPARE PROMPT FOR LLM (using only DB state)
        let referencesForResponse = [];
        let actualSourcePipeline = `${llmProvider}-direct`;
        let ragContextString = "";
        
        if (useRag) {
            actualSourcePipeline = `${llmProvider}-rag`;
            const relevantDocsFromRag = await queryPythonRagService(
                userId.toString(), query.trim(), criticalThinkingEnabled, documentContextName, filter
            );
            if (relevantDocsFromRag?.length > 0) {
                ragContextString = relevantDocsFromRag.map((doc, index) => {
                    referencesForResponse.push({
                        number: index + 1, source: doc.documentName,
                        content_preview: doc.content.substring(0, 100) + (doc.content.length > 100 ? "..." : "")
                    });
                    return `\n[${index + 1}] Source: ${doc.documentName}\nContent:\n${doc.content}\n---`;
                }).join('');
            }
        }
        
        const historyForLlm = [];
        if (summaryFromDb) {
            historyForLlm.push({ role: 'user', parts: [{ text: `CONTEXT: Here is a summary of our conversation so far. Use it to inform your response but do not mention the summary itself in your answer:\n\n"""\n${summaryFromDb}\n"""` }] });
            historyForLlm.push({ role: 'model', parts: [{ text: "Okay, I have reviewed the summary of our previous conversation. I will use this context for my next response. How can I help you now?" }] });
        }
        
        const formattedDbMessages = historyFromDb.map(msg => ({
            role: msg.role, parts: msg.parts.map(part => ({ text: part.text || '' }))
        }));
        historyForLlm.push(...formattedDbMessages);
        
        const queryForLLM = useRag && ragContextString
            ? CHAT_USER_PROMPT_TEMPLATES.rag(query.trim(), ragContextString, clientProvidedSystemInstruction)
            : CHAT_USER_PROMPT_TEMPLATES.direct(query.trim(), clientProvidedSystemInstruction);
        const fullHistoryForLLM = [...historyForLlm, { role: 'user', parts: [{ text: queryForLLM }] }];
        
        // 3. CALL LLM SERVICE
        console.log(`   Calling ${llmProvider} API. Effective history length for LLM: ${fullHistoryForLLM.length}.`);
        const aiResponseMessageText = llmProvider === 'ollama'
            ? await ollamaService.generateContentWithHistory(fullHistoryForLLM, CHAT_MAIN_SYSTEM_PROMPT(), { model: ollamaModel })
            : await geminiService.generateContentWithHistory(fullHistoryForLLM, CHAT_MAIN_SYSTEM_PROMPT());

        const aiMessageForDbAndClient = {
            sender: 'bot', role: 'model', parts: [{ text: aiResponseMessageText }], text: aiResponseMessageText,
            timestamp: new Date(), thinking: null, references: referencesForResponse, source_pipeline: actualSourcePipeline,
        };

        // 4. PERSIST FINAL STATE TO DB
        await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { $push: { messages: { $each: [userMessageForDb, aiMessageForDbAndClient] } }, $set: { updatedAt: new Date() } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`<<< POST /api/chat/message successful for Session ${sessionId}. DB state updated.`);
        res.status(200).json({ reply: aiMessageForDbAndClient });

    } catch (error) {
        console.error(`!!! Error processing chat message for Session ${sessionId}:`, error);
        const statusCode = error.status || error.response?.status || 500;
        const clientMessage = error.message || "Failed to get response from AI service.";
        
        const errorMessageForChat = {
            sender: 'bot', role: 'model', parts: [{ text: `Error: ${clientMessage}` }], text: `Error: ${clientMessage}`,
            timestamp: new Date(), thinking: `Error occurred: ${error.message}`, references: [], source_pipeline: 'error-pipeline'
        };
        
        try {
            await ChatHistory.findOneAndUpdate(
                { sessionId: sessionId, userId: userId },
                { $push: { messages: { $each: [userMessageForDb, errorMessageForChat] } }, $set: { updatedAt: new Date() } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        } catch (dbError) {
            console.error(`!!! CRITICAL: Failed to save error message to chat history for Session ${sessionId}:`, dbError);
        }
        res.status(statusCode).json({ message: clientMessage, reply: errorMessageForChat });
    }
});


// --- @route   POST /api/chat/history ---
// --- @desc    Handles starting a new session, summarizing the old one to carry over context ---
// --- @access  Private ---
router.post('/history', async (req, res) => {
    const { previousSessionId } = req.body;
    const userId = req.user._id;
    const newSessionId = uuidv4();
    let summaryOfOldSession = "";

    console.log(`>>> POST /api/chat/history (New Session): User=${userId}, PrevSID=${previousSessionId}`);

    if (previousSessionId) {
        try {
            const oldSession = await ChatHistory.findOne({ sessionId: previousSessionId, userId: userId });
            const user = await User.findById(userId).select('preferredLlmProvider ollamaModel').lean();
            const llmProvider = user?.preferredLlmProvider || 'gemini';
            const ollamaModel = user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL;

            if (oldSession && oldSession.messages?.length > 0) {
                console.log(`   Summarizing previous session ${previousSessionId} to carry over context.`);
                const fullHistoryOfOldSession = oldSession.messages;
                summaryOfOldSession = await createOrUpdateSummary(
                    fullHistoryOfOldSession,
                    oldSession.summary, // Pass existing summary to be cumulative
                    llmProvider,
                    ollamaModel
                );
            }
        } catch (summaryError) {
            console.error(`!!! Could not summarize previous session ${previousSessionId}:`, summaryError);
        }
    }

    try {
        await ChatHistory.create({
            userId: userId,
            sessionId: newSessionId,
            messages: [],
            summary: summaryOfOldSession,
        });
        console.log(`<<< POST /api/chat/history: New session ${newSessionId} created for User=${userId}. Summary length: ${summaryOfOldSession.length}`);
        res.status(200).json({
            message: 'New session started.',
            newSessionId: newSessionId,
        });
    } catch (dbError) {
        console.error(`!!! Failed to create new chat session ${newSessionId} in DB:`, dbError);
        res.status(500).json({ message: 'Failed to create new session due to a server error.' });
    }
});


// --- @route   GET /api/chat/sessions ---
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

module.exports = router;