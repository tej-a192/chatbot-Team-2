// server/routes/adminDocuments.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = fs.promises;
const AdminDocument = require('../models/AdminDocument');
const { fixedAdminAuthMiddleware } = require('../middleware/fixedAdminAuthMiddleware');
const axios = require('axios');

const router = express.Router();

// --- Constants & Multer Config (unchanged) ---
const ADMIN_UPLOAD_DIR_BASE = path.join(__dirname, '..', 'assets', '_admin_uploads_');
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const allowedAdminMimeTypes = {
    'application/pdf': 'docs',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docs',
    'text/plain': 'docs',
    'text/markdown': 'docs',
};
const allowedAdminExtensions = ['.pdf', '.docx', '.txt', '.md'];

const adminStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const fileMimeType = file.mimetype.toLowerCase();
        const fileTypeSubfolder = allowedAdminMimeTypes[fileMimeType] || 'others';
        const destinationPath = path.join(ADMIN_UPLOAD_DIR_BASE, fileTypeSubfolder);
        fs.mkdir(destinationPath, { recursive: true }, (err) => {
            if (err) return cb(err);
            cb(null, destinationPath);
        });
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const fileExt = path.extname(file.originalname).toLowerCase();
        const sanitizedBaseName = path.basename(file.originalname, fileExt)
            .replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
        cb(null, `${timestamp}-${sanitizedBaseName}${fileExt}`);
    }
});

const adminFileFilter = (req, file, cb) => {
    const fileExt = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();
    if (allowedAdminMimeTypes[mimeType] && allowedAdminExtensions.includes(fileExt)) {
        cb(null, true);
    } else {
        const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE_TYPE_ADMIN');
        error.message = `Invalid file type. Allowed: ${allowedAdminExtensions.join(', ')}`;
        cb(error, false);
    }
};

const adminUpload = multer({ storage: adminStorage, fileFilter: adminFileFilter, limits: { fileSize: MAX_FILE_SIZE }});

async function triggerPythonRagProcessingForAdmin(filePath, originalName) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        return { success: false, message: "Python service URL not configured.", text: null, chunksForKg: [] };
    }
    const addDocumentUrl = `${pythonServiceUrl}/add_document`;
    try {
        const response = await axios.post(addDocumentUrl, {
            user_id: "admin",
            file_path: filePath, original_name: originalName
        }, { timeout: 300000 });
        
        const text = response.data?.raw_text_for_analysis || null;
        const chunksForKg = response.data?.chunks_with_metadata || [];
        const isSuccess = !!(text && text.trim());
        return { 
            success: isSuccess, 
            message: response.data?.message || "Python RAG service call completed.", 
            text: text,
            chunksForKg: chunksForKg
        };
    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message || "Unknown error calling Python RAG.";
        return { success: false, message: `Python RAG call failed: ${errorMsg}`, text: null, chunksForKg: [] };
    }
}

async function callPythonDeletionEndpoint(method, endpointPath, userId, originalName) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL || 'http://localhost:5000';
    const deleteUrl = `${pythonServiceUrl.replace(/\/$/, '')}${endpointPath}`;
    try {
        await axios.delete(deleteUrl, {
            data: { user_id: userId, document_name: originalName },
            timeout: 30000
        });
        return { success: true, message: `Successfully requested deletion from ${endpointPath}` };
    } catch (error) {
        return { success: false, message: `Python service call failed for ${endpointPath}: ${error.message}` };
    }
}

// --- MODIFIED TO TRIGGER KG WORKER CORRECTLY ---
router.post('/upload', fixedAdminAuthMiddleware, adminUpload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded or file type rejected.' });
    }
    const { filename: serverFilename, originalname: originalName, path: tempServerPath } = req.file;
    let adminDocRecord;
    try {
        if (await AdminDocument.exists({ originalName: originalName })) {
            await fsPromises.unlink(tempServerPath);
            return res.status(409).json({ message: `Document '${originalName}' already exists.` });
        }

        const ragResult = await triggerPythonRagProcessingForAdmin(tempServerPath, originalName);
        if (!ragResult.success) {
            await fsPromises.unlink(tempServerPath);
            return res.status(422).json({ message: ragResult.message });
        }

        adminDocRecord = new AdminDocument({
            filename: serverFilename, originalName: originalName, text: ragResult.text,
        });
        await adminDocRecord.save();
        await fsPromises.unlink(tempServerPath);

        res.status(202).json({
            message: `Admin document '${originalName}' uploaded. Background processing initiated.`,
        });

        const { Worker } = require('worker_threads');

        // Trigger Analysis Worker
        const analysisWorker = new Worker(path.resolve(__dirname, '..', 'workers', 'adminAnalysisWorker.js'), {
            workerData: {
                adminDocumentId: adminDocRecord._id.toString(),
                originalName: originalName, textForAnalysis: ragResult.text
            }
        });
        analysisWorker.on('error', (err) => console.error(`Admin Analysis Worker Error [Doc: ${originalName}]:`, err));

        // --- CORRECTLY TRIGGER THE EXISTING KG WORKER ---
        if (ragResult.chunksForKg && ragResult.chunksForKg.length > 0) {
            const kgWorker = new Worker(path.resolve(__dirname, '..', 'workers', 'kgWorker.js'), {
                workerData: {
                    adminDocumentId: adminDocRecord._id.toString(), // Pass the specific ID for an admin doc
                    userId: "admin", // The consistent ID for admin KG data
                    originalName: originalName,
                    chunksForKg: ragResult.chunksForKg,
                    llmProvider: 'gemini' // Admin tasks use the server's default provider
                }
            });
            kgWorker.on('error', (err) => console.error(`Admin KG Worker Error [Doc: ${originalName}]:`, err));
        } else {
            console.warn(`[Admin Upload] No chunks for KG processing for '${originalName}'.`);
            await AdminDocument.updateOne({ _id: adminDocRecord._id }, { $set: { kgStatus: "skipped_no_chunks" } });
        }

    } catch (error) {
        console.error(`Admin Upload: Overall error for '${originalName || req.file?.originalname}':`, error);
        if (tempServerPath) await fsPromises.unlink(tempServerPath).catch(() => {});
        if (!res.headersSent) {
            res.status(500).json({ message: 'Server error during admin document upload.' });
        }
    }
});

// Other routes (GET, DELETE, etc.) remain the same...
router.get('/', fixedAdminAuthMiddleware, async (req, res) => {
    try {
        const adminDocs = await AdminDocument.find().sort({ uploadedAt: -1 })
            .select('originalName filename uploadedAt analysisUpdatedAt analysis.faq analysis.topics analysis.mindmap');
        const documentsList = adminDocs.map(doc => ({
            originalName: doc.originalName, serverFilename: doc.filename, uploadedAt: doc.uploadedAt,
            analysisUpdatedAt: doc.analysisUpdatedAt,
            hasFaq: !!(doc.analysis?.faq?.trim()),
            hasTopics: !!(doc.analysis?.topics?.trim()),
            hasMindmap: !!(doc.analysis?.mindmap?.trim()),
        }));
        res.json({ documents: documentsList });
    } catch (error) {
        res.status(500).json({ message: 'Server error fetching admin documents.' });
    }
});

router.delete('/:serverFilename', fixedAdminAuthMiddleware, async (req, res) => {
    const { serverFilename } = req.params;
    if (!serverFilename) {
        return res.status(400).json({ message: 'Server filename is required.' });
    }
    try {
        const docToDelete = await AdminDocument.findOne({ filename: serverFilename });
        if (!docToDelete) {
            return res.status(404).json({ message: `Admin document '${serverFilename}' not found.` });
        }

        const originalName = docToDelete.originalName;
        const userId = "admin";

        await callPythonDeletionEndpoint('DELETE', `/delete_qdrant_document_data`, userId, originalName);
        await callPythonDeletionEndpoint('DELETE', `/kg/${userId}/${encodeURIComponent(originalName)}`, userId, originalName);
        await AdminDocument.deleteOne({ _id: docToDelete._id });

        res.status(200).json({ message: `Admin document '${originalName}' deleted.` });
    } catch (error) {
        res.status(500).json({ message: 'Server error during admin document deletion.' });
    }
});

router.get('/:serverFilename/analysis', fixedAdminAuthMiddleware, async (req, res) => {
    const { serverFilename } = req.params;
    if (!serverFilename) return res.status(400).json({ message: 'Server filename parameter is required.' });
    try {
        const adminDoc = await AdminDocument.findOne({ filename: serverFilename }).select('originalName analysis analysisUpdatedAt');
        if (!adminDoc) return res.status(404).json({ message: `Admin document '${serverFilename}' not found.` });
        res.status(200).json({
            originalName: adminDoc.originalName,
            analysis: adminDoc.analysis || { faq: "", topics: "", mindmap: "" },
            analysisUpdatedAt: adminDoc.analysisUpdatedAt
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error retrieving admin document analysis.' });
    }
});

router.get('/by-original-name/:originalName/analysis', fixedAdminAuthMiddleware, async (req, res) => {
    const { originalName } = req.params;
    if (!originalName) return res.status(400).json({ message: 'Original name parameter is required.' });
    try {
        const decodedOriginalName = decodeURIComponent(originalName);
        const adminDoc = await AdminDocument.findOne({ originalName: decodedOriginalName })
            .select('originalName filename analysis analysisUpdatedAt');
        if (!adminDoc) {
            return res.status(404).json({ message: `Admin document '${decodedOriginalName}' not found.` });
        }
        res.status(200).json({
            originalName: adminDoc.originalName,
            serverFilename: adminDoc.filename,
            analysis: adminDoc.analysis || { faq: "", topics: "", mindmap: "" },
            analysisUpdatedAt: adminDoc.analysisUpdatedAt
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error while retrieving analysis by original name.' });
    }
});


module.exports = router;