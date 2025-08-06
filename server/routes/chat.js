// server/routes/chat.js
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const ChatHistory = require('../models/ChatHistory');
const User = require('../models/User');
const { processQueryWithToT_Streaming } = require('../services/totOrchestrator');
const { analyzeAndRecommend } = require('../services/sessionAnalysisService');
const { processAgenticRequest } = require('../services/agentService');
const { generateCues } = require('../services/criticalThinkingService');
const { decrypt } = require('../utils/crypto');
const { redisClient } = require('../config/redisClient');
const { analyzePrompt } = require('../services/promptCoachService');
const { extractAndStoreKgFromText } = require('../services/kgExtractionService');
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
        systemPrompt: clientSystemPrompt, criticalThinkingEnabled,
        documentContextName
    } = req.body;
    
    const userId = req.user._id;

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

        const requestContext = {
            llmProvider,
            ollamaModel,
            apiKey: user?.encryptedApiKey ? decrypt(user.encryptedApiKey) : null,
            ollamaUrl: user?.ollamaUrl,
            userId: userId.toString(),
            isWebSearchEnabled: !!useWebSearch,
            isAcademicSearchEnabled: !!useAcademicSearch,
            documentContextName,
            systemPrompt: clientSystemPrompt,
            criticalThinkingEnabled,
        };

        const historyForLlm = chatSession ? chatSession.messages.map(msg => ({
            role: msg.role, parts: msg.parts.map(part => ({ text: part.text || '' }))
        })) : [];

        // --- THIS IS THE FIX ---
        // 1. Call the agent service.
        const agentResponse = await processAgenticRequest(
            query.trim(), historyForLlm, clientSystemPrompt, requestContext
        );

        // 2. Prepare the message object for the database.
        const aiMessageForDb = {
            sender: 'bot',
            role: 'model',
            parts: [{ text: agentResponse.finalAnswer }],
            text: agentResponse.finalAnswer,
            timestamp: new Date(),
            thinking: agentResponse.thinking,
            references: agentResponse.references || [],
            source_pipeline: agentResponse.sourcePipeline,
        };

        // 3. Prepare the response object for the client. This includes the action payload.
        const aiMessageForClient = { ...aiMessageForDb, action: agentResponse.action || null };

        // 4. Run post-response tasks like generating cues and saving to DB.
        if (criticalThinkingEnabled && !agentResponse.action) {
             aiMessageForClient.criticalThinkingCues = await generateCues(agentResponse.finalAnswer, requestContext);
        }

        await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { $push: { messages: { $each: [userMessageForDb, aiMessageForDb] } } },
            { upsert: true, new: true }
        );

        console.log(`<<< POST /api/chat/message (Agentic) successful for Session ${sessionId}.`);
        
        // 5. Send the correct object (with the action) back to the client.
        res.status(200).json({ reply: aiMessageForClient });
        
        // 6. Asynchronously extract KG data.
        if (agentResponse.finalAnswer) {
             extractAndStoreKgFromText(agentResponse.finalAnswer, sessionId, userId.toString(), requestContext);
        }
        // --- END OF FIX ---

    } catch (error) {
        console.error(`!!! Error processing chat message for Session ${sessionId}:`, error);
        const clientMessage = error.message || "Failed to get response from AI service.";
        if (!res.headersSent) {
            res.status(error.status || 500).json({ message: clientMessage });
        }
    }
});


router.post('/history', async (req, res) => {
    const { previousSessionId, skipAnalysis } = req.body;
    const userId = req.user._id;
    const newSessionId = uuidv4();
    
    // This will hold our final response payload
    const responsePayload = {
        message: 'New session started.',
        newSessionId: newSessionId,
        studyPlanSuggestion: null // Default to null
    };

    try {
        if (previousSessionId && !skipAnalysis) {
            const previousSession = await ChatHistory.findOne({ sessionId: previousSessionId, userId: userId });
            
            if (previousSession && previousSession.messages?.length > 1) {
                console.log(`[Chat Route] Finalizing previous session '${previousSessionId}'...`);
                
                const user = await User.findById(userId).select('profile preferredLlmProvider ollamaModel ollamaUrl +encryptedApiKey');
                const llmConfig = {
                    llmProvider: user?.preferredLlmProvider || 'gemini',
                    ollamaModel: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL,
                    apiKey: user?.encryptedApiKey ? decrypt(user.encryptedApiKey) : null,
                    ollamaUrl: user?.ollamaUrl || null
                };

                const { summary, knowledgeGaps, recommendations, keyTopics } = await analyzeAndRecommend(
                    previousSession.messages, previousSession.summary,
                    llmConfig.llmProvider, llmConfig.ollamaModel, llmConfig.apiKey, llmConfig.ollamaUrl
                );

                await ChatHistory.updateOne(
                    { sessionId: previousSessionId, userId: userId },
                    { $set: { summary: summary } }
                );

                if (knowledgeGaps && knowledgeGaps.size > 0) {
                    user.profile.performanceMetrics.clear();     
                    knowledgeGaps.forEach((score, topic) => {
                        user.profile.performanceMetrics.set(topic.replace(/\./g, '-'), score);
                    });
                    await user.save(); 
                    console.log(`[Chat Route] Updated user performance metrics with ${knowledgeGaps.size} new gaps.`);

                    let mostSignificantGap = null;
                    let lowestScore = 1.1;

                    knowledgeGaps.forEach((score, topic) => {
                        if (score < lowestScore) {
                            lowestScore = score;
                            mostSignificantGap = topic;
                        }
                    });

                    if (mostSignificantGap && lowestScore < 0.6) {
                        console.log(`[Chat Route] SIGNIFICANT KNOWLEDGE GAP DETECTED: "${mostSignificantGap}" (Score: ${lowestScore}). Generating study plan suggestion.`);
                        responsePayload.studyPlanSuggestion = {
                            topic: mostSignificantGap,
                            reason: `Analysis of your last session shows this is a key area for improvement.`
                        };
                    }
                }
                
                if (keyTopics && keyTopics.length > 0 && !responsePayload.studyPlanSuggestion) {
                    const primaryTopic = keyTopics[0];
                    console.log(`[Chat Route] Focused topic detected: "${primaryTopic}". Generating study plan suggestion.`);
                    responsePayload.studyPlanSuggestion = {
                        topic: primaryTopic,
                        reason: `Your last session focused on ${primaryTopic}. Would you like to create a structured study plan to master it?`
                    };
                }

                if (redisClient && redisClient.isOpen && recommendations && recommendations.length > 0) {
                    const cacheKey = `recommendations:${newSessionId}`;
                    await redisClient.set(cacheKey, JSON.stringify(recommendations), { EX: 3600 });
                    console.log(`[Chat Route] Caching ${recommendations.length} quick recommendations for new session ${newSessionId}.`);
                }
            }
        }

        await ChatHistory.create({ userId, sessionId: newSessionId, messages: [] });
        console.log(`[Chat Route] New session ${newSessionId} created. Sending response to user ${userId}.`);
        res.status(200).json(responsePayload);

    } catch (error) {
        console.error(`Error during finalize-and-create-new process:`, error);
        if (!res.headersSent) {
            try {
                await ChatHistory.create({ userId, sessionId: newSessionId, messages: [] });
                responsePayload.message = 'New session started, but analysis of previous session failed.';
                res.status(200).json(responsePayload);
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


// @route   POST /api/chat/analyze-prompt
// @desc    Analyze a user's prompt and suggest improvements.
// @access  Private
router.post('/analyze-prompt', async (req, res) => {
    const { prompt } = req.body;
    const userId = req.user._id;

    // --- REVISED VALIDATION ---
    if (!prompt || typeof prompt !== 'string') {
        console.warn(`[API /analyze-prompt] Bad Request from user ${userId}: 'prompt' field is missing or not a string. Received body:`, req.body);
        return res.status(400).json({ message: "'prompt' field is missing or invalid." });
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 3) { // <-- The changed value
        console.warn(`[API /analyze-prompt] Bad Request from user ${userId}: Prompt is too short. Received: "${trimmedPrompt}"`);
        return res.status(400).json({ message: `Prompt must be at least 3 characters long.` }); // <-- The changed message
    }
    // --- END REVISED VALIDATION ---

    try {
        const analysis = await analyzePrompt(userId, trimmedPrompt);
        res.status(200).json(analysis);
    } catch (error) {
        console.error(`[API /analyze-prompt] Error for user ${userId} with prompt "${trimmedPrompt.substring(0, 50)}...":`, error);
        res.status(500).json({ message: error.message || 'Server error during prompt analysis.' });
    }
});

module.exports = router;