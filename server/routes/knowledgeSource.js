// server/routes/knowledgeSource.js
const express = require('express');
const router = express.Router();
const { Worker } = require('worker_threads');
const path = require('path');
const axios = require('axios');
const User = require('../models/User');
const AdminDocument = require('../models/AdminDocument');
const KnowledgeSource = require('../models/KnowledgeSource');
const { decrypt } = require('../utils/crypto');

// @route   POST /api/knowledge-sources
// @desc    Add a new URL-based knowledge source
// @access  Private
router.post('/', async (req, res) => {
    const { type, content } = req.body;
    const userId = req.user._id;

    if (type !== 'url' || !content) {
        return res.status(400).json({ message: "Request must be for type 'url' and include 'content'." });
    }

    let newSource;
    try {
        // Create initial record in DB to track progress
        newSource = new KnowledgeSource({
            userId,
            sourceType: 'webpage', // Default, Python will confirm if it's YouTube
            title: content, // Use URL as initial title
            sourceUrl: content,
            status: 'processing_extraction',
        });
        await newSource.save();

        // Immediately respond to the user so the UI doesn't hang
        res.status(202).json({ 
            message: "URL received. Processing has started in the background.",
            source: newSource 
        });
        
        // --- Start background processing ---
        const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
        if (!pythonServiceUrl) throw new Error("Python service URL not configured.");

        // 1. Call Python to extract text
        const extractionResponse = await axios.post(`${pythonServiceUrl}/process_url`, {
            url: content,
            user_id: userId.toString(),
        }, { timeout: 300000 }); // 5 min timeout for scraping/transcription

        const { text_content, title, source_type } = extractionResponse.data;
        
        // 2. Update the source document with extracted text
        const sourceDoc = await KnowledgeSource.findById(newSource._id);
        sourceDoc.textContent = text_content;
        sourceDoc.title = title;
        sourceDoc.sourceType = source_type;
        sourceDoc.status = 'processing_analysis';
        await sourceDoc.save();

        // 3. Trigger analysis and KG workers (similar to upload route)
        const user = await User.findById(userId).select('+encryptedApiKey preferredLlmProvider ollamaModel ollamaUrl').lean();
        const llmProvider = user?.preferredLlmProvider || 'gemini';
        const userApiKey = user.encryptedApiKey ? decrypt(user.encryptedApiKey) : null;
        
        if (llmProvider === 'gemini' && !userApiKey) {
            throw new Error(`User ${userId} selected Gemini but has no API key.`);
        }

        const workerBaseData = {
            sourceId: sourceDoc._id.toString(),
            userId: userId.toString(),
            originalName: title,
            llmProvider,
            ollamaModel: user.ollamaModel,
            apiKey: userApiKey,
            ollamaUrl: user.ollamaUrl
        };
        
        // Analysis Worker for FAQ, Topics, etc.
        const analysisWorker = new Worker(path.resolve(__dirname, '../workers/analysisWorker.js'), { 
            workerData: { ...workerBaseData, textForAnalysis: text_content }
        });
        analysisWorker.on('error', (err) => console.error(`Analysis Worker Error (URL: ${title}):`, err));

        // KG Worker needs to run AFTER analysis, so we'll need a more robust system later.
        // For now, we'll just log this limitation.
        console.log(`[knowledgeSource.js] TODO: Implement sequential or dependent worker system for KG after ai_core processing.`);


    } catch (error) {
        console.error(`Error processing URL source '${content}':`, error);
        if (newSource) {
            await KnowledgeSource.updateOne({ _id: newSource._id }, {
                $set: { status: 'failed', failureReason: error.message }
            });
        }
    }
});

// @route   GET /api/knowledge-sources
// @desc    Get all knowledge sources for the user (files, urls) and admin (subjects)
// @access  Private
router.get('/', async (req, res) => {
    try {
        const userId = req.user._id;

        const userSourcesPromise = KnowledgeSource.find({ userId }).sort({ createdAt: -1 }).lean();
        const adminSubjectsPromise = AdminDocument.find().sort({ originalName: 1 }).select('originalName').lean();

        const [userSources, adminSubjects] = await Promise.all([userSourcesPromise, adminSubjectsPromise]);

        const formattedAdminSubjects = adminSubjects.map(doc => ({
            _id: `admin_${doc._id}`, // Create a unique ID for the frontend key
            sourceType: 'subject',
            title: doc.originalName,
            status: 'completed'
        }));

        res.json([...formattedAdminSubjects, ...userSources]);
    } catch (error) {
        console.error("Error fetching all knowledge sources:", error);
        res.status(500).json({ message: "Server error while fetching knowledge sources." });
    }
});


module.exports = router;