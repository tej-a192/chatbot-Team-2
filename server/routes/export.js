// server/routes/export.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const User = require('../models/User');
const AdminDocument = require('../models/AdminDocument');
const { decrypt } = require('../utils/crypto');

router.post('/podcast', async (req, res) => {
    const { analysisContent, sourceDocumentName, podcastOptions } = req.body;
    const userId = req.user._id;

    if (!analysisContent || !sourceDocumentName || !podcastOptions) {
        return res.status(400).json({ message: 'analysisContent, sourceDocumentName, and podcastOptions are required.' });
    }

    try {
        let sourceDocumentText = null;
        let apiKeyForRequest = null;
        
        // Fetch the user to get their documents and encrypted API key
        const user = await User.findById(userId).select('uploadedDocuments.filename uploadedDocuments.text +encryptedApiKey');

        // Check user's documents first
        const userDoc = user?.uploadedDocuments.find(doc => doc.filename === sourceDocumentName);
        if (userDoc?.text) {
            sourceDocumentText = userDoc.text;
            if (user.encryptedApiKey) {
                apiKeyForRequest = decrypt(user.encryptedApiKey);
            }
        } else {
            // Fallback to checking admin documents
            const adminDoc = await AdminDocument.findOne({ originalName: sourceDocumentName }).select('text');
            if (adminDoc?.text) {
                sourceDocumentText = adminDoc.text;
                apiKeyForRequest = process.env.GEMINI_API_KEY; // Admin docs use server's key
            }
        }
        
        if (!sourceDocumentText) {
            return res.status(404).json({ message: `Source document '${sourceDocumentName}' not found.` });
        }
        if (!apiKeyForRequest) {
            return res.status(400).json({ message: "API Key for podcast generation is missing." });
        }

        const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
        if (!pythonServiceUrl) {
            return res.status(500).json({ message: "Audio generation service is not configured." });
        }

        const generationUrl = `${pythonServiceUrl}/export_podcast`;
        
        console.log(`[Node Export] Forwarding HQ podcast request to Python with API Key.`);

        const pythonPayload = {
            sourceDocumentText: sourceDocumentText,
            analysisContent: analysisContent,
            podcastOptions: podcastOptions,
            api_key: apiKeyForRequest // <<< Pass the correct key
        };
        
        const fileResponse = await axios.post(generationUrl, pythonPayload, {
            responseType: 'stream',
            timeout: 600000 // 10 minute timeout
        });

        const safeFilename = sourceDocumentName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
        const finalFilename = `HQ_Podcast_${safeFilename}.mp3`;
        
        res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
        res.setHeader('Content-Type', 'audio/mpeg');
        fileResponse.data.pipe(res);

    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message || "Failed to generate podcast.";
        console.error(`[Node Export] Error proxying podcast generation: ${errorMsg}`);
        if (!res.headersSent) {
            res.status(error.response?.status || 500).json({ message: errorMsg });
        }
    }
});

module.exports = router;