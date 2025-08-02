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
const fs = require('fs').promises;

// --- HELPER FOR PYTHON SERVICE DELETION ---
async function callPythonDeletionEndpoint(endpointPath, userId, documentName) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.warn(`Python Service Deletion request for ${documentName} skipped: URL not configured.`);
        return { success: false, message: "Python service URL not configured." };
    }
    const deleteUrl = `${pythonServiceUrl.replace(/\/$/, '')}${endpointPath}`;
    try {
        await axios.delete(deleteUrl, {
            data: { user_id: userId, document_name: documentName },
            timeout: 30000
        });
        return { success: true, message: `Successfully requested deletion from ${endpointPath}` };
    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message;
        console.error(`Error calling Python for deletion (${deleteUrl}): ${errorMsg}`);
        return { success: false, message: errorMsg };
    }
}


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
        if (!sourceDoc) throw new Error(`KnowledgeSource with ID ${newSource._id} disappeared during processing.`);

        sourceDoc.textContent = text_content;
        sourceDoc.title = title;
        sourceDoc.sourceType = source_type;
        sourceDoc.status = 'processing_analysis';
        await sourceDoc.save();

        // 3. Trigger analysis worker
        const user = await User.findById(userId).select('+encryptedApiKey preferredLlmProvider ollamaModel ollamaUrl').lean();
        const llmProvider = user?.preferredLlmProvider || 'gemini';
        const userApiKey = user.encryptedApiKey ? decrypt(user.encryptedApiKey) : null;
        
        const workerBaseData = {
            sourceId: sourceDoc._id.toString(),
            originalName: title,
            llmProvider,
            ollamaModel: user.ollamaModel,
            apiKey: userApiKey,
            ollamaUrl: user.ollamaUrl,
            textForAnalysis: text_content
        };
        
        const analysisWorker = new Worker(path.resolve(__dirname, '../workers/analysisWorker.js'), { 
            workerData: workerBaseData
        });
        analysisWorker.on('error', (err) => console.error(`Analysis Worker Error (URL: ${title}):`, err));
        
        // Note: KG worker is not triggered for URLs yet as there's no chunking pipeline for them. This can be added later.

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
        const adminSubjectsPromise = AdminDocument.find().sort({ originalName: 1 }).select('originalName createdAt').lean();

        const [userSources, adminSubjects] = await Promise.all([userSourcesPromise, adminSubjectsPromise]);

        const formattedAdminSubjects = adminSubjects.map(doc => ({
            _id: `admin_${doc._id}`, // Create a unique ID for the frontend key
            sourceType: 'subject',
            title: doc.originalName,
            status: 'completed',
            createdAt: doc.createdAt // Pass the creation date
        }));

        res.json([...formattedAdminSubjects, ...userSources]);
    } catch (error) {
        console.error("Error fetching all knowledge sources:", error);
        res.status(500).json({ message: "Server error while fetching knowledge sources." });
    }
});


// --- NEW ---
// @route   DELETE /api/knowledge-sources/:sourceId
// @desc    Delete a knowledge source and all its associated data
// @access  Private
router.delete('/:sourceId', async (req, res) => {
    const { sourceId } = req.params;
    const userId = req.user._id.toString();
    const username = req.user.username;

    try {
        const source = await KnowledgeSource.findOne({ _id: sourceId, userId });
        if (!source) {
            return res.status(404).json({ message: "Knowledge source not found or you do not have permission to delete it." });
        }

        console.log(`[Delete Source] Deleting source: '${source.title}' for user: ${username}`);

        // 1. Delete from Vector DB (Qdrant) and Graph DB (Neo4j) via Python service
        await callPythonDeletionEndpoint(`/delete_qdrant_document_data`, userId, source.title);
        await callPythonDeletionEndpoint(`/kg/${userId}/${encodeURIComponent(source.title)}`, userId, source.title);

        // 2. If it's a file, move the physical file to a backup location
        if (source.sourceType === 'document' && source.serverFilename) {
            const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
            const sourcePath = path.join(__dirname, '..', 'assets', sanitizedUsername, 'document', source.serverFilename);
            const backupDir = path.join(__dirname, '..', 'backup_assets', sanitizedUsername, 'document');
            
            await fs.mkdir(backupDir, { recursive: true });
            const backupPath = path.join(backupDir, source.serverFilename);
            
            try {
                await fs.rename(sourcePath, backupPath);
                console.log(`[Delete Source] Backed up file to ${backupPath}`);
            } catch (fileError) {
                if (fileError.code !== 'ENOENT') { // ENOENT = file not found, which is ok if it was already cleaned up
                    console.warn(`[Delete Source] Could not back up physical file '${sourcePath}': ${fileError.message}`);
                }
            }
        }

        // 3. Delete from MongoDB
        await KnowledgeSource.deleteOne({ _id: sourceId });
        console.log(`[Delete Source] Removed MongoDB record for '${source.title}'`);

        res.status(200).json({ message: `Successfully deleted '${source.title}'.` });
    } catch (error) {
        console.error(`[Delete Source] Error deleting source ID '${sourceId}':`, error);
        res.status(500).json({ message: "An error occurred while deleting the knowledge source." });
    }
});


module.exports = router;