// server/routes/chat.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const ChatHistory = require('../models/ChatHistory');
const User = require('../models/User');
const { processAgenticRequest } = require('../services/agentService');
const { generateCues } = require('../services/criticalThinkingService');
const { decrypt } = require('../utils/crypto');
const { extractAndStoreKgFromText } = require('../services/kgExtractionService');
const { analyzeAndRecommend } = require('../services/sessionAnalysisService');
const { analyzePrompt } = require('../services/promptCoachService');
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
        
        const llmConfig = {
            llmProvider: user?.preferredLlmProvider || 'gemini',
            ollamaModel: user?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL,
            apiKey: user?.encryptedApiKey ? decrypt(user.encryptedApiKey) : null,
            ollamaUrl: user?.ollamaUrl
        };

        const historyForLlm = chatSession ? chatSession.messages.map(msg => ({
            role: msg.role, 
            // Ensure parts exist and are mapped correctly to prevent crashes
            parts: (msg.parts || []).map(part => ({ text: part.text || '' })) 
        })) : [];

        const requestContext = {
            documentContextName, criticalThinkingEnabled, filter, userId: userId.toString(),
            systemPrompt: clientProvidedSystemInstruction, isWebSearchEnabled: !!useWebSearch,
            isAcademicSearchEnabled: !!useAcademicSearch,
            chatHistory: [...historyForLlm, { role: 'user', parts: [{ text: query }] }],
            ...llmConfig
        };
        
        console.log(`[Chat Route] Diverting to standard Agentic Service.`);
        
        const agentResponse = await processAgenticRequest(query.trim(), historyForLlm, clientProvidedSystemInstruction, requestContext);

        let aiMessageForDb;
        if (agentResponse.reply && agentResponse.reply.type === 'document_generated') {
            // --- THIS IS THE FIX ---
            // A placeholder 'parts' array is now added to document messages. This
            // ensures a consistent schema for all messages in the database, preventing
            // a crash when the history is prepared for the next LLM call.
            aiMessageForDb = { 
                role: 'model',
                type: 'document_generated',
                payload: agentResponse.reply.payload,
                parts: [{ text: `[Generated Document: ${agentResponse.reply.payload.title}]` }],
                timestamp: agentResponse.reply.timestamp,
                source_pipeline: agentResponse.sourcePipeline || 'agent-generate_document'
            }; 
            // --- END OF FIX ---
        } else {
            aiMessageForDb = {
                role: 'model',
                type: 'text',
                parts: [{ text: agentResponse.finalAnswer || 'No response text.' }],
                timestamp: new Date(),
                thinking: agentResponse.thinking || null,
                references: agentResponse.references || [],
                source_pipeline: agentResponse.sourcePipeline || `${llmConfig.llmProvider}-agent-error`
            };
        }
        
        await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { $push: { messages: { $each: [userMessageForDb, aiMessageForDb] } } },
            { upsert: true, new: true }
        );

        let responseForClient;
        if (agentResponse.reply && agentResponse.reply.type === 'document_generated') {
            responseForClient = {
                reply: agentResponse.reply,
                thinking: agentResponse.thinking,
                references: agentResponse.references,
                sourcePipeline: agentResponse.sourcePipeline,
                criticalThinkingCues: []
            };
        } else {
            const finalAnswerText = agentResponse.finalAnswer || "I am sorry, I could not generate a response.";
            const criticalThinkingCues = await generateCues(finalAnswerText, llmConfig);
            responseForClient = {
                reply: {
                    sender: 'bot', role: 'model', text: finalAnswerText,
                    parts: [{ text: finalAnswerText }], timestamp: new Date().toISOString(),
                },
                thinking: agentResponse.thinking, references: agentResponse.references,
                sourcePipeline: agentResponse.sourcePipeline, criticalThinkingCues: criticalThinkingCues || []
            };
        }
        res.status(200).json(responseForClient);
        
        console.log(`<<< POST /api/chat/message (Agentic) successful for Session ${sessionId}.`);
        if (agentResponse.finalAnswer && typeof agentResponse.finalAnswer === 'string') {
            extractAndStoreKgFromText(agentResponse.finalAnswer, sessionId, userId, llmConfig);
        }

    } catch (error) {
        console.error(`!!! Error processing chat message for Session ${sessionId}:`, error);
        res.status(error.status || 500).json({ message: error.message || "Failed to get response from AI service." });
    }
});


router.post('/history', async (req, res) => {
    const { previousSessionId } = req.body;
    const userId = req.user._id;
    const newSessionId = uuidv4();

    const responsePayload = {
        message: 'New session started.',
        newSessionId: newSessionId,
        studyPlanSuggestion: null 
    };

    try {
        if (previousSessionId) {
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

        const messagesForFrontend = (session.messages || []).map(msg => {
            if (msg.type === 'document_generated') {
                return {
                    id: msg._id || uuidv4(),
                    sender: 'bot',
                    role: 'model',
                    type: msg.type,
                    payload: msg.payload,
                    timestamp: msg.timestamp
                };
            }
            return { 
                id: msg._id || uuidv4(), 
                sender: msg.role === 'model' ? 'bot' : 'user', 
                role: msg.role,
                text: msg.parts?.[0]?.text || '', 
                parts: msg.parts,
                thinking: msg.thinking, 
                references: msg.references, 
                timestamp: msg.timestamp, 
                sourcePipeline: msg.source_pipeline
            };
        });

        res.status(200).json({ ...session, messages: messagesForFrontend });
    } catch (error) {
        console.error(`!!! Error fetching chat session ${req.params.sessionId} for user ${req.user._id}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat session details.' });
    }
});


router.post('/analyze-prompt', async (req, res) => {
    const { prompt } = req.body;
    const userId = req.user._id;

    if (!prompt || typeof prompt !== 'string') {
        console.warn(`[API /analyze-prompt] Bad Request from user ${userId}: 'prompt' field is missing or not a string. Received body:`, req.body);
        return res.status(400).json({ message: "'prompt' field is missing or invalid." });
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length < 3) { 
        console.warn(`[API /analyze-prompt] Bad Request from user ${userId}: Prompt is too short. Received: "${trimmedPrompt}"`);
        return res.status(400).json({ message: `Prompt must be at least 3 characters long.` }); 
    }

    try {
        const analysis = await analyzePrompt(userId, trimmedPrompt);
        res.status(200).json(analysis);
    } catch (error) {
        console.error(`[API /analyze-prompt] Error for user ${userId} with prompt "${trimmedPrompt.substring(0, 50)}...":`, error);
        res.status(500).json({ message: error.message || 'Server error during prompt analysis.' });
    }
});

module.exports = router;