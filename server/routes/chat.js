// server/routes/chat.js
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const ChatHistory = require('../models/ChatHistory');
const User = require('../models/User');
const { processQueryWithToT_Streaming } = require('../services/totOrchestrator');
const { analyzeAndRecommend } = require('../services/sessionAnalysisService');
const { processAgenticRequest } = require('../services/agentService');
const { decrypt } = require('../utils/crypto');
const { redisClient } = require('../config/redisClient');
const router = express.Router();


function streamEvent(res, eventData) {
    if (res.writableEnded) {
        console.warn('[Chat Route Stream] Attempted to write to an already closed stream.');
        return;
    }
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
}



function doesQuerySuggestRecall(query) {
    const lowerCaseQuery = query.toLowerCase();
    const recallKeywords = [
        'my name', 'my profession', 'i am', 'i told you',
        'remember', 'recall', 'remind me', 'go back to',
        'previously', 'before', 'we discussed', 'we were talking about',
        'earlier', 'yesterday', 'last session',
        'what did i say', 'what was', 'what were', 'who am i',
        'do you know', 'can you tell me again',
        'continue with', 'let\'s continue', 'pick up where we left off',
    ];
    return recallKeywords.some(keyword => lowerCaseQuery.includes(keyword));
}


router.post('/message', async (req, res) => {
    const {
        query, sessionId, useWebSearch, useAcademicSearch,
        systemPrompt: clientProvidedSystemInstruction, criticalThinkingEnabled,
        documentContextName, filter
    } = req.body;
    
    const userId = req.user._id;

    console.log(`%c[DEBUG | POST /message] Request Received`, 'color: #FFD700; font-weight: bold;');
    console.log(`  - Session ID from Client:`, sessionId);
    console.log(`  - User ID:`, userId.toString());

    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Query message text required.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: 'Session ID required.' });
    }

    const userMessageForDb = { role: 'user', parts: [{ text: query }], timestamp: new Date() };
    console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, CriticalThinking=${criticalThinkingEnabled}, Query: "${query.substring(0, 50)}..."`);

    try {
        const [chatSession, user] = await Promise.all([
            ChatHistory.findOne({ sessionId: sessionId, userId: userId }),
            User.findById(userId).select('+encryptedApiKey preferredLlmProvider ollamaModel ollamaUrl').lean()
        ]);

        const llmProvider = user?.preferredLlmProvider || 'gemini';
        const ollamaModel = user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL;

        const historyFromDb = chatSession ? chatSession.messages : [];
        const summaryFromDb = chatSession ? chatSession.summary || "" : "";
        
        const historyForLlm = [];

        if (summaryFromDb && doesQuerySuggestRecall(query.trim())) {
            historyForLlm.push({ 
                role: 'user', 
                parts: [{ text: `CONTEXT (Summary of Past Conversations): """${summaryFromDb}"""` }] 
            });
            historyForLlm.push({ 
                role: 'model', 
                parts: [{ text: "Understood. I will use this context if the user's query is about our past conversations." }] 
            });
        }

        const formattedDbMessages = historyFromDb.map(msg => ({
            role: msg.role, parts: msg.parts.map(part => ({ text: part.text || '' }))
        }));
        historyForLlm.push(...formattedDbMessages);
        
        const requestContext = {
            documentContextName, criticalThinkingEnabled, filter,
            llmProvider, ollamaModel,
            isWebSearchEnabled: !!useWebSearch, isAcademicSearchEnabled: !!useAcademicSearch,
            userId: userId.toString(), ollamaUrl: user.ollamaUrl,
            systemPrompt: clientProvidedSystemInstruction
        };

        if (llmProvider === 'gemini') {
            requestContext.apiKey = user.encryptedApiKey ? decrypt(user.encryptedApiKey) : null;
        }

        if (criticalThinkingEnabled) {
            console.log(`[Chat Route] Diverting to ToT Orchestrator.`);
            
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const accumulatedThoughts = [];

            const interceptingStreamCallback = (eventData) => {
                if (eventData.type === 'thought' || eventData.type === 'error') {
                    if (eventData.type === 'thought') {
                        accumulatedThoughts.push(eventData.content);
                    }
                    streamEvent(res, eventData);
                }
            };

            const totResult = await processQueryWithToT_Streaming(
                query.trim(), historyForLlm, requestContext, interceptingStreamCallback
            );

            const aiMessageForDbAndClient = {
                sender: 'bot', role: 'model',
                parts: [{ text: totResult.finalAnswer }],
                text: totResult.finalAnswer,
                timestamp: new Date(),
                thinking: accumulatedThoughts.join(''),
                references: totResult.references || [],
                source_pipeline: totResult.sourcePipeline,
            };

            streamEvent(res, { type: 'final_answer', content: aiMessageForDbAndClient });
            
            console.log(`%c[DEBUG | POST /message] Executing DB Update`, 'color: #FFD700; font-weight: bold;');
            console.log(`  - Action: findOneAndUpdate (This will ADD messages to the existing session)`);
            console.log(`  - Target Session ID:`, sessionId);

            await ChatHistory.findOneAndUpdate(
                { sessionId: sessionId, userId: userId },
                { $push: { messages: { $each: [userMessageForDb, aiMessageForDbAndClient] } } },
                { upsert: true, new: true }
            );
            console.log(`<<< POST /api/chat/message (ToT) successful for Session ${sessionId}.`);
            res.end();

        } else {
            console.log(`[Chat Route] Diverting to standard Agentic Service.`);

            const agentResponse = await processAgenticRequest(
                query.trim(), historyForLlm, clientProvidedSystemInstruction, requestContext
            );

            const aiMessageForDbAndClient = {
                sender: 'bot', role: 'model',
                parts: [{ text: agentResponse.finalAnswer }],
                text: agentResponse.finalAnswer,
                timestamp: new Date(),
                thinking: agentResponse.thinking || null,
                references: agentResponse.references || [],
                source_pipeline: agentResponse.sourcePipeline,
            };
            console.log("---------------------------------------");
            console.log(`[DB WRITE | /message] PRE-SAVE for Session ${sessionId}`);
            console.log(`  - Attempting to atomically $push user message: "${userMessageForDb.parts[0].text.substring(0, 50)}..."`);
            console.log(`  - Attempting to atomically $push AI response: "${aiMessageForDbAndClient.text.substring(0, 50)}..."`);
            console.log("---------------------------------------");
            await ChatHistory.findOneAndUpdate(
                { sessionId: sessionId, userId: userId },
                { $push: { messages: { $each: [userMessageForDb, aiMessageForDbAndClient] } } },
                { upsert: true, new: true }
            );
            console.log("---------------------------------------");
            console.log(`[DB WRITE | /message] POST-SAVE for Session ${sessionId}`);
            console.log(`  - findOneAndUpdate operation completed successfully.`);
            console.log("---------------------------------------");

            console.log(`<<< POST /api/chat/message (Agentic) successful for Session ${sessionId}.`);
            res.status(200).json({ reply: aiMessageForDbAndClient });
        }

    } catch (error) {
        console.error(`!!! Error processing chat message for Session ${sessionId}:`, error);
        const clientMessage = error.message || "Failed to get response from AI service.";
        
        if (res.headersSent && !res.writableEnded) {
            streamEvent(res, { type: 'error', content: clientMessage });
            res.end();
        } else if (!res.headersSent) {
            res.status(error.status || 500).json({ message: clientMessage });
        }
    }
});

router.post('/history', async (req, res) => {
    const { previousSessionId } = req.body;
    const userId = req.user._id;
    const newSessionId = uuidv4();

    try {
        if (previousSessionId) {
            const previousSession = await ChatHistory.findOne({ sessionId: previousSessionId, userId: userId });
            
            if (previousSession && previousSession.messages?.length > 1) {
                console.log("---------------------------------------");
                console.log(`[DB READ | /history] PRE-ANALYSIS for Session ${previousSessionId}`);
                console.log(`  - Document loaded from DB contains ${previousSession.messages.length} messages.`);
                console.log("---------------------------------------");
                console.log(`[Chat Route] POST /history: Finalizing previous session '${previousSessionId}' for user '${userId}'...`);
                
                const user = await User.findById(userId).select('profile preferredLlmProvider ollamaModel ollamaUrl +encryptedApiKey');
                const llmConfig = {
                    llmProvider: user?.preferredLlmProvider || 'gemini',
                    ollamaModel: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL,
                    apiKey: user?.encryptedApiKey ? decrypt(user.encryptedApiKey) : null,
                    ollamaUrl: user?.ollamaUrl || null
                };

                const { summary, knowledgeGaps, recommendations } = await analyzeAndRecommend(
                    previousSession.messages, previousSession.summary,
                    llmConfig.llmProvider, llmConfig.ollamaModel, llmConfig.apiKey, llmConfig.ollamaUrl
                );

                await ChatHistory.updateOne(
                    { sessionId: previousSessionId, userId: userId },
                    { $set: { summary: summary } }
                );


                console.log("---------------------------------------");
                console.log("History added");
                console.log("---------------------------------------");

                

                if (knowledgeGaps && knowledgeGaps.size > 0) {
                    user.profile.performanceMetrics.clear();     
                    knowledgeGaps.forEach((score, topic) => {
                        const sanitizedTopic = topic.replace(/\./g, '-');
                        user.profile.performanceMetrics.set(sanitizedTopic, score);
                    });
                    await user.save(); 
                    console.log(`[Chat Route] Overwrote user performance metrics with ${knowledgeGaps.size} new gaps.`);
                }
                
                if (redisClient && redisClient.isOpen && recommendations && recommendations.length > 0) {
                    const cacheKey = `recommendations:${newSessionId}`;
                    await redisClient.set(cacheKey, JSON.stringify(recommendations), { EX: 3600 });
                    console.log(`[Chat Route] Caching ${recommendations.length} recommendations for new session ${newSessionId}.`);
                }
            }
        }

        await ChatHistory.create({ userId, sessionId: newSessionId, messages: [] });
        console.log(`[Chat Route] New session ${newSessionId} created and sent to user ${userId}.`);
        res.status(200).json({ message: 'New session started.', newSessionId });

    } catch (error) {
        console.error(`Error during finalize-and-create-new process:`, error);
        if (!res.headersSent) {
            try {
                await ChatHistory.create({ userId, sessionId: newSessionId, messages: [] });
                res.status(200).json({ 
                    message: 'New session started, but analysis of previous session failed.',
                    newSessionId: newSessionId 
                });
            } catch (fallbackError) {
                 res.status(500).json({ message: 'A critical error occurred while creating a new session.' });
            }
        }
    }
});

router.get('/sessions', async (req, res) => {
    try {
        const sessions = await ChatHistory.find({ userId: req.user._id }).sort({ updatedAt: -1 }).select('sessionId createdAt updatedAt messages').lean();
        const sessionSummaries = sessions.map(session => {
            const firstUserMessage = session.messages?.find(m => m.role === 'user');
            let preview = firstUserMessage?.parts?.[0]?.text?.substring(0, 75) || 'Chat Session';
            if (preview.length === 75) preview += '...';
            return { sessionId: session.sessionId, createdAt: session.createdAt, updatedAt: session.updatedAt, messageCount: session.messages?.length || 0, preview: preview };
        });
        res.status(200).json(sessionSummaries);
    } catch (error) {
        res.status(500).json({ message: 'Failed to retrieve chat sessions.' });
    }
});

router.get('/session/:sessionId', async (req, res) => {
    try {
        const session = await ChatHistory.findOne({ sessionId: req.params.sessionId, userId: req.user._id }).lean();
        if (!session) return res.status(404).json({ message: 'Chat session not found or access denied.' });
        const messagesForFrontend = (session.messages || []).map(msg => ({ id: msg._id || uuidv4(), sender: msg.role === 'model' ? 'bot' : 'user', text: msg.parts?.[0]?.text || '', thinking: msg.thinking, references: msg.references, timestamp: msg.timestamp, source_pipeline: msg.source_pipeline }));
        res.status(200).json({ ...session, messages: messagesForFrontend });
    } catch (error) {
        console.error(`!!! Error fetching chat session ${req.params.sessionId} for user ${req.user._id}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat session details.' });
    }
});

router.delete('/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const userId = req.user._id;
    try {
        const result = await ChatHistory.deleteOne({ sessionId: sessionId, userId: userId });
        if (redisClient && redisClient.isOpen) {
            const cacheKey = `session:${sessionId}`;
            await redisClient.del(cacheKey);
        }
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Chat session not found.' });
        }
        res.status(200).json({ message: 'Chat session deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting chat session.' });
    }
});

module.exports = router;