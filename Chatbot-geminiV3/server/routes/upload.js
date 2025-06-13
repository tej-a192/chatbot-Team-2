// server/routes/upload.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { authMiddleware } = require('../middleware/authMiddleware');
const User = require('../models/User');
const { Worker } = require('worker_threads');

const router = express.Router();

// --- Constants & Multer Config (Unchanged) ---
const UPLOAD_DIR = path.join(__dirname, '..', 'assets');
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const allowedMimeTypes = {
    'application/pdf': 'docs',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docs',
    'application/msword': 'docs',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'docs',
    'application/vnd.ms-powerpoint': 'docs',
    'text/plain': 'docs',
    'text/x-python': 'code',
    'application/javascript': 'code',
    'text/javascript': 'code',
    'text/markdown': 'code',
    'text/html': 'code',
    'application/xml': 'code',
    'text/xml': 'code',
    'application/json': 'code',
    'text/csv': 'code',
    'image/jpeg': 'images',
    'image/png': 'images',
    'image/bmp': 'images',
    'image/gif': 'images',
};
const allowedExtensions = [
    '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt',
    '.py', '.js', '.md', '.html', '.xml', '.json', '.csv', '.log',
    '.jpg', '.jpeg', '.png', '.bmp', '.gif'
];
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!req.user || !req.user.username) {
            return cb(new Error("Authentication error: User context not found."));
        }
        const sanitizedUsername = req.user.username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileMimeType = file.mimetype.toLowerCase();
        const fileTypeSubfolder = allowedMimeTypes[fileMimeType] || 'others';
        const destinationPath = path.join(UPLOAD_DIR, sanitizedUsername, fileTypeSubfolder);
        fs.mkdir(destinationPath, { recursive: true }, (err) => {
             if (err) cb(err);
             else cb(null, destinationPath);
         });
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const fileExt = path.extname(file.originalname).toLowerCase();
        const sanitizedBaseName = path.basename(file.originalname, fileExt)
                                      .replace(/[^a-zA-Z0-9._-]/g, '_')
                                      .substring(0, 100);
        const uniqueFilename = `${timestamp}-${sanitizedBaseName}${fileExt}`;
        cb(null, uniqueFilename);
    }
});
const fileFilter = (req, file, cb) => {
    if (!req.user) {
         const error = new multer.MulterError('UNAUTHENTICATED');
         error.message = `User not authenticated.`;
         return cb(error, false);
    }
    const fileExt = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();
    if (allowedMimeTypes[mimeType] && allowedExtensions.includes(fileExt)) {
        cb(null, true);
    } else {
        const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
        error.message = `Invalid file type or extension. Allowed extensions: ${allowedExtensions.join(', ')}`;
        cb(error, false);
    }
};
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: MAX_FILE_SIZE }
});

async function triggerPythonRagProcessing(userId, filePath, originalName) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set in environment. Cannot trigger RAG processing.");
        return { success: false, message: "RAG service URL not configured.", status: 'error', text: null, chunksForKg: [] };
    }

    const addDocumentUrl = `${pythonServiceUrl}/add_document`;
    console.log(`Calling Python RAG Service: ${addDocumentUrl} for document '${originalName}' (User: ${userId})`);
    try {
        const response = await axios.post(addDocumentUrl, {
            user_id: userId,
            file_path: filePath,
            original_name: originalName
        });
        
        const pythonData = response.data;
        const text = pythonData?.raw_text_for_analysis || null;
        const chunksForKg = pythonData?.chunks_with_metadata || [];
        const pythonStatus = pythonData?.status;
        const pythonMessage = pythonData?.message || "No specific message from Python RAG service.";

        // A successful outcome is one where we got text back.
        const isSuccess = !!(text && text.trim() !== "");

        return {
            success: isSuccess,
            status: pythonStatus,
            message: pythonMessage,
            text: text,
            chunksForKg: chunksForKg
        };

    } catch (error) {
        const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || "Unknown error calling Python RAG service";
        console.error(`Error calling Python RAG service for '${originalName}': ${errorMsg}`);
        return {
            success: false, message: `Python RAG service call failed: ${errorMsg}`,
            status: 'error_calling_python', text: null, chunksForKg: []
        };
    }
}

router.post('/', authMiddleware, (req, res) => {
    const uploader = upload.single('file');

    uploader(req, res, async function (err) {
        if (!req.user) {
            return res.status(401).json({ message: "Authentication error: User context not found." });
        }
        const userId = req.user._id.toString();
        const username = req.user.username;
        let absoluteFilePath = null, originalName = null, serverFilename = null;

        if (err) {
            console.error(`Upload Route: Multer error for user '${username}': ${err.message}`);
            return res.status(err instanceof multer.MulterError ? 400 : 500).json({ message: err.message });
        }
        if (!req.file) {
            return res.status(400).json({ message: "No file received or file type rejected by filter." });
        }

        absoluteFilePath = path.resolve(req.file.path);
        originalName = req.file.originalname;
        serverFilename = req.file.filename;
        console.log(`Upload Route: File received for user '${username}'. Server Filename: ${serverFilename}, Original: ${originalName}`);

        const userLlmPrefs = await User.findById(userId).select('preferredLlmProvider ollamaModel').lean();
        const llmProviderForWorkers = userLlmPrefs?.preferredLlmProvider || 'gemini';
        const ollamaModelForWorkers = userLlmPrefs?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL;

        try {
            const userForPreCheck = await User.findById(userId).select('uploadedDocuments.filename');
            if (!userForPreCheck) {
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Cleanup Error: ${e.message}`));
                return res.status(404).json({ message: "User not found, cannot process upload." });
            }
            if (userForPreCheck.uploadedDocuments.some(doc => doc.filename === originalName)) {
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Cleanup Error: ${e.message}`));
                return res.status(409).json({ message: `File '${originalName}' already exists.` });
            }

            const ragResult = await triggerPythonRagProcessing(userId, absoluteFilePath, originalName);

            // The critical check is whether the Python service returned any text.
            if (!ragResult.success) {
                const errorMessage = ragResult.message || "RAG processing failed to extract any text from the document.";
                console.error(`Upload Route Error for '${originalName}': ${errorMessage}`);
                if (absoluteFilePath) await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Cleanup Error: ${e.message}`));
                return res.status(422).json({ message: errorMessage, filename: serverFilename, originalname: originalName });
            }

            console.log(`Upload Route: RAG processing for '${originalName}' successful. Text obtained. Python Status: ${ragResult.status}.`);
            
            const newDocumentEntryData = {
                filename: originalName, text: ragResult.text,
                analysis: { faq: "", topics: "", mindmap: "" },
                uploadedAt: new Date(), ragStatus: ragResult.status,
                analysisStatus: "pending", kgStatus: "pending"
            };
            await User.updateOne({ _id: userId }, { $push: { uploadedDocuments: newDocumentEntryData } });
            
            res.status(202).json({
                message: `File '${originalName}' accepted. Background processing initiated.`,
                filename: serverFilename, originalname: originalName,
                initialStatus: { rag: ragResult.status, analysis: "pending", knowledgeGraph: "pending" }
            });

            // Offload Analysis and KG work
            const analysisWorkerPath = path.resolve(__dirname, '../workers/analysisWorker.js');
            const kgWorkerScriptPath = path.resolve(__dirname, '../workers/kgWorker.js');

            const analysisWorker = new Worker(analysisWorkerPath, { workerData: { userId, originalName, textForAnalysis: ragResult.text, llmProvider: llmProviderForWorkers, ollamaModel: ollamaModelForWorkers } });
            analysisWorker.on('message', (msg) => console.log(`[BG] Analysis Worker [Doc: ${msg.originalName || originalName}]: ${msg.message || JSON.stringify(msg)}`));
            analysisWorker.on('error', (err) => console.error(`[BG] Analysis Worker Error [Doc: ${originalName}]:`, err));
            analysisWorker.on('exit', (code) => console.log(`[BG] Analysis Worker [Doc: ${originalName}] exited (code ${code}).`));

            if (ragResult.chunksForKg && ragResult.chunksForKg.length > 0) {
                const kgWorker = new Worker(kgWorkerScriptPath, { workerData: { chunksForKg: ragResult.chunksForKg, userId, originalName, llmProvider: llmProviderForWorkers, ollamaModel: ollamaModelForWorkers } });
                kgWorker.on('message', (msg) => console.log(`[BG] KG Worker [Doc: ${msg.originalName || originalName}]: ${msg.message || JSON.stringify(msg)}`));
                kgWorker.on('error', (err) => console.error(`[BG] KG Worker Error [Doc: ${originalName}]:`, err));
                kgWorker.on('exit', (code) => console.log(`[BG] KG Worker [Doc: ${originalName}] exited (code ${code}).`));
            } else {
                await User.updateOne({ _id: userId, "uploadedDocuments.filename": originalName }, { $set: { "uploadedDocuments.$.kgStatus": "skipped_no_chunks" } });
            }

            if (absoluteFilePath) {
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`[BG] Non-critical: Failed to delete temp file ${absoluteFilePath}: ${e.message}`));
            }

        } catch (processError) {
            console.error(`Upload Route: !!! Overall processing error for ${originalName || 'unknown file'}:`, processError);
            if (absoluteFilePath) await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Cleanup Error: ${e.message}`));
            if (!res.headersSent) {
                res.status(500).json({ message: `Server error during file processing: ${processError.message}` });
            }
        }
    }); 
});

module.exports = router;