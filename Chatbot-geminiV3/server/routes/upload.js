// server/routes/upload.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { authMiddleware } = require('../middleware/authMiddleware');
const User = require('../models/User'); // Import the User model
const { Worker } = require('worker_threads');
// const { ANALYSIS_PROMPTS } = require('../config/promptTemplates'); 
// const geminiService = require('../services/geminiService');

const router = express.Router();

// --- Constants ---
const UPLOAD_DIR = path.join(__dirname, '..', 'assets');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// Define allowed types by mimetype and extension (lowercase)
// Mapping mimetype to subfolder name
const allowedMimeTypes = {
    // Documents -> 'docs'
    'application/pdf': 'docs',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docs', // .docx
    'application/msword': 'docs', // .doc (Might be less reliable mimetype)
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'docs', // .pptx
    'application/vnd.ms-powerpoint': 'docs', // .ppt (Might be less reliable mimetype)
    'text/plain': 'docs', // .txt
    // Code -> 'code'
    'text/x-python': 'code', // .py
    'application/javascript': 'code', // .js
    'text/javascript': 'code', // .js (alternative)
    'text/markdown': 'code', // .md
    'text/html': 'code', // .html
    'application/xml': 'code', // .xml
    'text/xml': 'code', // .xml
    'application/json': 'code', // .json
    'text/csv': 'code', // .csv
    // Images -> 'images'
    'image/jpeg': 'images',
    'image/png': 'images',
    'image/bmp': 'images',
    'image/gif': 'images',
    // Add more specific types if needed, otherwise they fall into 'others'
};
// Define allowed extensions (lowercase) - This is a secondary check
const allowedExtensions = [
    '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt',
    '.py', '.js', '.md', '.html', '.xml', '.json', '.csv', '.log', // Added .log
    '.jpg', '.jpeg', '.png', '.bmp', '.gif'
];

// --- Multer Config ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // authMiddleware middleware ensures req.user exists here
        if (!req.user || !req.user.username) {
            // This should ideally not happen if authMiddleware works correctly
            console.error("Multer Destination Error: User context missing after auth middleware.");
            return cb(new Error("Authentication error: User context not found."));
        }
        const sanitizedUsername = req.user.username.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fileMimeType = file.mimetype.toLowerCase();

        // Determine subfolder based on mimetype, default to 'others'
        const fileTypeSubfolder = allowedMimeTypes[fileMimeType] || 'others';
        const destinationPath = path.join(UPLOAD_DIR, sanitizedUsername, fileTypeSubfolder);

        // Ensure the destination directory exists (use async for safety)
        fs.mkdir(destinationPath, { recursive: true }, (err) => {
             if (err) {
                 console.error(`Error creating destination path ${destinationPath}:`, err);
                 cb(err);
             } else {
                 cb(null, destinationPath);
             }
         });
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const fileExt = path.extname(file.originalname).toLowerCase();
        // Sanitize base name: remove extension, replace invalid chars, limit length
        const sanitizedBaseName = path.basename(file.originalname, fileExt)
                                      .replace(/[^a-zA-Z0-9._-]/g, '_') // Allow letters, numbers, dot, underscore, hyphen
                                      .substring(0, 100); // Limit base name length
        const uniqueFilename = `${timestamp}-${sanitizedBaseName}${fileExt}`;
        cb(null, uniqueFilename);
    }
});

const fileFilter = (req, file, cb) => {
    // authMiddleware middleware should run before this, ensuring req.user exists
    if (!req.user) {
         console.warn(`Upload Rejected (File Filter): User context missing.`);
         const error = new multer.MulterError('UNAUTHENTICATED'); // Custom code?
         error.message = `User not authenticated.`;
         return cb(error, false);
    }

    const fileExt = path.extname(file.originalname).toLowerCase();
    const mimeType = file.mimetype.toLowerCase();

    // Primary check: Mimetype must be in our known list OR extension must be allowed
    // Secondary check: Extension must be in the allowed list
    const isMimeTypeKnown = !!allowedMimeTypes[mimeType];
    const isExtensionAllowed = allowedExtensions.includes(fileExt);

    // Allow if (MIME type is known OR extension is explicitly allowed) AND extension is in the allowed list
    // This allows known MIME types even if extension isn't listed, and listed extensions even if MIME isn't known (e.g. text/plain for .log)
    // But we always require the extension itself to be in the allowed list for safety.
    // if ((isMimeTypeKnown || isExtensionAllowed) && isExtensionAllowed) {

    // Stricter: Allow only if BOTH mimetype is known AND extension is allowed
    if (isMimeTypeKnown && isExtensionAllowed) {
        cb(null, true); // Accept file
    } else {
        console.warn(`Upload Rejected (File Filter): User='${req.user.username}', File='${file.originalname}', MIME='${mimeType}', Ext='${fileExt}'. MimeKnown=${isMimeTypeKnown}, ExtAllowed=${isExtensionAllowed}`);
        const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
        error.message = `Invalid file type or extension. Allowed extensions: ${allowedExtensions.join(', ')}`;
        cb(error, false); // Reject file
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: MAX_FILE_SIZE }
});
// --- End Multer Config ---


// --- Function to call Python RAG service ---
async function triggerPythonRagProcessing(userId, filePath, originalName) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set in environment. Cannot trigger RAG processing.");
        return {
            success: false,
            message: "RAG service URL not configured.",
            status: 'error', // Indicate a config error
            text: null,
            chunksForKg: []
        };
    }

    const addDocumentUrl = `${pythonServiceUrl}/add_document`;
    console.log(`Calling Python RAG Service: ${addDocumentUrl} for document '${originalName}' (User: ${userId})`);

    try {
        const response = await axios.post(addDocumentUrl, {
            user_id: userId,
            file_path: filePath, // Absolute path to the file on the server
            original_name: originalName
        }); // 5 minute timeout

        const pythonData = response.data;
        // console.log(`Python RAG service response for '${originalName}':`, JSON.stringify(pythonData).substring(0, 500) + "..."); // Log snippet

        // Extract data carefully, providing defaults
        const text = pythonData?.raw_text_for_analysis || null;
        const chunksForKg = pythonData?.chunks_with_metadata || [];
        const pythonStatus = pythonData?.status; // e.g., 'added', 'skipped_no_content', 'processed_qdrant_chunks_not_added', etc.
        let pythonMessage = pythonData?.message || "No specific message from Python RAG service.";

        // Determine overall success for the RAG step based on Python's status
        // 'added' means Qdrant was updated, which is the primary goal for RAG.
        // 'processed_for_analysis_only_no_qdrant' means text was extracted but Qdrant failed/skipped. This might still be a "partial success" if text is valuable.
        // For now, let's consider 'added' as the main success criteria for proceeding with text-dependent tasks.
        const isRagStepSuccessful = pythonStatus === 'added';

        if (!isRagStepSuccessful && !text) {
            // If RAG didn't succeed in adding to Qdrant AND there's no text, it's a more significant failure.
            pythonMessage = `RAG processing critical failure: ${pythonMessage} (Status: ${pythonStatus})`;
        } else if (!isRagStepSuccessful && text) {
            pythonMessage = `RAG processing partial: ${pythonMessage} (Status: ${pythonStatus}). Text was extracted, but Qdrant step may have issues.`;
        }


        return {
            success: isRagStepSuccessful, // True primarily if pythonStatus is 'added'
            status: pythonStatus,         // The actual status string from Python
            message: pythonMessage,
            text: text,                   // Extracted text (can be null)
            chunksForKg: chunksForKg      // Chunks for KG (can be empty)
        };

    } catch (error) {
        const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || "Unknown error calling Python RAG service";
        console.error(`Error calling Python RAG service for '${originalName}': ${errorMsg}`);
        // Log more details if available from error.response
        if (error.response && error.response.data) {
            // console.error("Python service error details:", error.response.data);
        }
        return {
            success: false,
            message: `Python RAG service call failed: ${errorMsg}`,
            status: 'error_calling_python', // Custom status for this type of failure
            text: null,
            chunksForKg: []
        };
    }
}
// --- End Function ---


// --- Function to call Generate Analysis
async function triggerAnalysisGeneration(userId, originalName, textForAnalysis) {
    console.log(`Starting analysis generation for document '${originalName}', User ID: ${userId}. Text length: ${textForAnalysis.length}`);

    let allAnalysesSuccessful = true; // Assume success initially
    const analysisResults = {
        faq: null,
        topics: null,
        mindmap: null
    };
    const logCtx = { userId, originalName }; // Context for logging within generateSingleAnalysis

    // Inner helper function to generate a single type of analysis
    async function generateSingleAnalysis(type, promptContent, context) {
        try {
            console.log(`Attempting to generate ${type} for '${context.originalName}' (User: ${context.userId}).`);

            // Prepare history for geminiService.generateContentWithHistory
            // The 'promptContent' (which is the system prompt) will be passed as the second argument.
            const historyForGemini = [
                { role: 'user', parts: [{ text: "Please perform the requested analysis based on the system instruction provided." }] }
            ];

            const generatedText = await geminiService.generateContentWithHistory(
                historyForGemini,
                promptContent // This is passed as systemPromptText to generateContentWithHistory
            );

            if (!generatedText || typeof generatedText !== 'string' || generatedText.trim() === "") {
                console.warn(`Gemini returned empty or invalid content for ${type} for '${context.originalName}'.`);
                allAnalysesSuccessful = false; // Update the outer scope variable
                return `Notice: No content was generated by the AI for ${type}. The input text might have been unsuitable or the AI returned an empty response.`;
            }

            console.log(`${type} generation successful for '${context.originalName}'. Length: ${generatedText.length}`);
            return generatedText.trim();

        } catch (error) {
            console.error(`Error during ${type} generation for '${context.originalName}' (User: ${context.userId}): ${error.message}`);
            allAnalysesSuccessful = false; // Update the outer scope variable
            // Return a user-friendly error message, or a snippet of the technical error
            const errorMessage = error.message || "Unknown error during AI generation.";
            return `Error generating ${type}: ${errorMessage.split('\n')[0].substring(0, 250)}`; // First line of error, truncated
        }
    }

    // 1. Generate FAQs
    console.log(`[Analysis Step 1/3] Preparing FAQ generation for '${originalName}'.`);
    const faqPrompt = ANALYSIS_PROMPTS.faq.getPrompt(textForAnalysis);
    analysisResults.faq = await generateSingleAnalysis('FAQ', faqPrompt, logCtx);
    if (!allAnalysesSuccessful) {
        console.warn(`FAQ generation failed or produced no content for '${originalName}'. Continuing to next analysis type.`);
        // We continue even if one fails, allAnalysesSuccessful flag will reflect the overall status.
    }

    // 2. Generate Topics
    console.log(`[Analysis Step 2/3] Preparing Topics generation for '${originalName}'.`);
    const topicsPrompt = ANALYSIS_PROMPTS.topics.getPrompt(textForAnalysis);
    analysisResults.topics = await generateSingleAnalysis('Topics', topicsPrompt, logCtx);
    if (!allAnalysesSuccessful && analysisResults.topics.startsWith("Error generating Topics:")) { // Check if this specific step failed
        console.warn(`Topics generation failed or produced no content for '${originalName}'. Continuing to next analysis type.`);
    }


    // 3. Generate Mindmap
    console.log(`[Analysis Step 3/3] Preparing Mindmap generation for '${originalName}'.`);
    const mindmapPrompt = ANALYSIS_PROMPTS.mindmap.getPrompt(textForAnalysis);
    analysisResults.mindmap = await generateSingleAnalysis('Mindmap', mindmapPrompt, logCtx);
    if (!allAnalysesSuccessful && analysisResults.mindmap.startsWith("Error generating Mindmap:")) { // Check if this specific step failed
        console.warn(`Mindmap generation failed or produced no content for '${originalName}'.`);
    }

    // Log final outcome of the analysis generation process
    if (allAnalysesSuccessful) {
        console.log(`All analyses (FAQ, Topics, Mindmap) appear to have been generated successfully for '${originalName}'.`);
    } else {
        console.warn(`One or more analyses failed or produced no content for '${originalName}'. Review individual results for details.`);
        // Log the specific results for easier debugging
        console.warn(`FAQ Result for '${originalName}': ${analysisResults.faq.substring(0,100)}...`);
        console.warn(`Topics Result for '${originalName}': ${analysisResults.topics.substring(0,100)}...`);
        console.warn(`Mindmap Result for '${originalName}': ${analysisResults.mindmap.substring(0,100)}...`);
    }

    return {
        success: allAnalysesSuccessful,
        results: analysisResults
    };
}
// --- End Analysis Generation Function ---


router.post('/', authMiddleware, (req, res) => {
    const uploader = upload.single('file');

    uploader(req, res, async function (err) {
        if (!req.user) {
            console.error("Upload Route: User context missing after auth middleware.");
            return res.status(401).json({ message: "Authentication error: User context not found." });
        }
        const userId = req.user._id.toString();
        const username = req.user.username;

        let absoluteFilePath = null; // Will be set if file is processed by multer
        let originalName = null;
        let serverFilename = null;

        if (err) {
            console.error(`Upload Route: Multer error for user '${username}': ${err.message}`);
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ message: err.message });
            }
            return res.status(500).json({ message: "Server error during upload preparation." });
        }

        if (!req.file) {
            console.warn(`Upload Route: No file received for user '${username}'.`);
            return res.status(400).json({ message: "No file received or file type rejected by filter." });
        }

        // File successfully received by multer
        absoluteFilePath = path.resolve(req.file.path);
        originalName = req.file.originalname;
        serverFilename = req.file.filename;
        console.log(`Upload Route: File received for user '${username}'. Server Filename: ${serverFilename}, Original: ${originalName}`);

        // Fetch user's LLM preferences for workers
        const userLlmPrefs = await User.findById(userId).select('preferredLlmProvider ollamaModel').lean();
        const llmProviderForWorkers = userLlmPrefs?.preferredLlmProvider || 'gemini'; // Default to gemini if not set
        const ollamaModelForWorkers = userLlmPrefs?.ollamaModel || process.env.OLLAMA_DEFAULT_MODEL;

        try {
            // ----- STAGE 1: MongoDB Pre-check for existing originalName -----
            const userForPreCheck = await User.findById(userId).select('uploadedDocuments.filename'); // Only need filename
            if (!userForPreCheck) {
                console.error(`Upload Route: User ${userId} ('${username}') not found during pre-check. Deleting uploaded file: ${absoluteFilePath}`);
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload Route Cleanup: Error deleting file (user not found): ${e.message}`));
                return res.status(404).json({ message: "User not found, cannot process upload." });
            }
            const existingDocument = userForPreCheck.uploadedDocuments.find(doc => doc.filename === originalName);
            if (existingDocument) {
                console.log(`Upload Route: File '${originalName}' already exists for user '${username}'. Deleting uploaded file: ${absoluteFilePath}`);
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload Route Cleanup: Error deleting file (duplicate): ${e.message}`));
                return res.status(409).json({
                    message: `File '${originalName}' already exists. No new processing initiated.`,
                    filename: serverFilename,
                    originalname: originalName,
                });
            }
            console.log(`Upload Route: Pre-check passed for '${originalName}' (User: '${username}'). Proceeding to RAG processing.`);

            // ----- STAGE 2: RAG Processing (Synchronous Call to Python Service) -----
            // This call extracts text, chunks, and gets data ready for Qdrant.
            // It needs to complete before we can save the initial document record and respond to the user.
            const ragResult = await triggerPythonRagProcessing(userId, absoluteFilePath, originalName);
            // Expected ragResult: { success, status ('added' or 'skipped'), text, chunksForKg, message }

            if (!ragResult.success || ragResult.status !== 'added' || !ragResult.text || ragResult.text.trim() === '') {
                const errorMessage = (ragResult && ragResult.message) || "RAG processing failed or returned insufficient data from Python service.";
                console.error(`Upload Route Error: RAG processing failed for '${originalName}' (User: '${username}'): ${errorMessage}. Python Status: ${ragResult.status}. Deleting file.`);
                if (absoluteFilePath) { // Check if path is still valid
                    await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload Route Cleanup: Error deleting file (RAG fail): ${e.message}`));
                }
                return res.status(500).json({ // Or 422 if it's a content issue from RAG
                    message: errorMessage,
                    filename: serverFilename, originalname: originalName
                });
            }
            console.log(`Upload Route: RAG processing by Python service completed for '${originalName}'. Text obtained. Python Status: ${ragResult.status}.`);

            // ----- STAGE 2.5: Initial MongoDB Save for the Document Entry -----
            // This creates the document shell with the text from RAG and pending statuses.
            const newDocumentEntryData = {
                filename: originalName,
                text: ragResult.text, // Save the text obtained from RAG
                analysis: { faq: "", topics: "", mindmap: "" }, // Initialize
                uploadedAt: new Date(),
                ragStatus: ragResult.status, // Should be 'added' here
                analysisStatus: "pending",   // Will be updated by analysisWorker
                kgStatus: "pending"          // Will be updated by kgWorker
            };

            try {
                await User.updateOne(
                    { _id: userId },
                    { $push: { uploadedDocuments: newDocumentEntryData } }
                );
                console.log(`Upload Route: Initial document entry for '${originalName}' saved to user '${username}' in MongoDB.`);
            } catch (dbError) {
                console.error(`Upload Route Error: MongoDB error saving initial document entry for '${originalName}': ${dbError.message}. Deleting file.`);
                if (absoluteFilePath) {
                    await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload Route Cleanup: Error deleting file (initial DB save fail): ${e.message}`));
                }
                // This is a server error, RAG was successful but we couldn't save.
                return res.status(500).json({ message: `Database error after RAG processing: ${dbError.message}`, filename: serverFilename, originalname: originalName });
            }

            // ----- IMMEDIATE RESPONSE TO CLIENT -----
            // Respond now, indicating acceptance and background processing.
            res.status(202).json({ // HTTP 202 Accepted
                message: `File '${originalName}' uploaded successfully. Processing has started in the background.`,
                filename: serverFilename, // Server-generated filename
                originalname: originalName,   // Original filename from user
                initialStatus: {
                    rag: ragResult.status,
                    analysis: "pending",
                    knowledgeGraph: "pending"
                }
            });
            console.log(`Upload Route: Sent 202 Accepted to client for '${originalName}'. Offloading further tasks.`);


            // ----- BACKGROUND PROCESSING INITIATION (AFTER RESPONSE) -----

            // Offload Analysis Generation to a Worker
            if (ragResult.text && ragResult.text.trim() !== '') {
                console.log(`[Upload Route BG] Initiating Analysis Worker for '${originalName}'`);
                const analysisWorkerPath = path.resolve(__dirname, '../workers/analysisWorker.js');
                try {
                    const analysisWorker = new Worker(analysisWorkerPath, {
                        workerData: {
                            userId: userId,
                            originalName: originalName,
                            textForAnalysis: ragResult.text, // Pass the full text
                            llmProvider: llmProviderForWorkers,
                            ollamaModel: ollamaModelForWorkers
                        }
                    });
                    analysisWorker.on('message', (msg) => console.log(`[Upload Route BG] Analysis Worker [Doc: ${msg.originalName || originalName}]: ${msg.message || JSON.stringify(msg)}`));
                    analysisWorker.on('error', (err) => console.error(`[Upload Route BG] Analysis Worker Error [Doc: ${originalName}]:`, err));
                    analysisWorker.on('exit', (code) => console.log(`[Upload Route BG] Analysis Worker [Doc: ${originalName}] exited (code ${code}).`));
                } catch (workerLaunchError) {
                    console.error(`[Upload Route BG] Failed to launch Analysis Worker for '${originalName}':`, workerLaunchError);
                    // Log this error, perhaps update DB doc analysisStatus to 'launch_failed'
                    User.updateOne(
                        { _id: userId, "uploadedDocuments.filename": originalName },
                        { $set: { "uploadedDocuments.$.analysisStatus": "launch_failed" } }
                    ).catch(e => console.error("DB update error for analysis launch fail (background):", e));
                }
            } else {
                console.warn(`[Upload Route BG] Skipping Analysis Worker for '${originalName}' due to no text from RAG.`);
                User.updateOne(
                    { _id: userId, "uploadedDocuments.filename": originalName },
                    { $set: { "uploadedDocuments.$.analysisStatus": "skipped_no_text" } }
                ).catch(e => console.error("DB update error for analysis skipped (background):", e));
            }

            // Offload KG Generation to a Worker
            // Ensure ragResult.chunksForKg is correctly populated by triggerPythonRagProcessing
            if (ragResult.status === "added" && ragResult.chunksForKg && ragResult.chunksForKg.length > 0) {
                console.log(`[Upload Route BG] Initiating KG Worker for '${originalName}'. Chunks: ${ragResult.chunksForKg.length}`);
                const kgWorkerScriptPath = path.resolve(__dirname, '../workers/kgWorker.js');
                try {
                    const kgWorker = new Worker(kgWorkerScriptPath, {
                        workerData: {
                            chunksForKg: ragResult.chunksForKg, // This comes from Python
                            userId: userId,
                            originalName: originalName,
                            llmProvider: llmProviderForWorkers,
                            ollamaModel: ollamaModelForWorkers
                        }
                    });
                    kgWorker.on('message', (msg) => console.log(`[Upload Route BG] KG Worker [Doc: ${msg.originalName || originalName}]: ${msg.message || JSON.stringify(msg)}`));
                    kgWorker.on('error', (workerErr) => console.error(`[Upload Route BG] KG Worker Error [Doc: ${originalName}]:`, workerErr));
                    kgWorker.on('exit', (code) => console.log(`[Upload Route BG] KG Worker [Doc: ${originalName}] exited (code ${code}).`));
                } catch (workerLaunchError) {
                    console.error(`[Upload Route BG] Failed to launch KG worker for '${originalName}':`, workerLaunchError);
                    User.updateOne(
                        { _id: userId, "uploadedDocuments.filename": originalName },
                        { $set: { "uploadedDocuments.$.kgStatus": "launch_failed" } }
                    ).catch(e => console.error("DB update error for KG launch fail (background):", e));
                }
            } else {
                let kgSkipReason = "skipped_rag_issue";
                if (ragResult.chunksForKg && ragResult.chunksForKg.length === 0) {
                    kgSkipReason = "skipped_no_chunks";
                }
                console.log(`[Upload Route BG] KG Worker not triggered for '${originalName}'. RAG Status: ${ragResult.status}, Chunks: ${ragResult.chunksForKg ? ragResult.chunksForKg.length : 'N/A'}`);
                User.updateOne(
                    { _id: userId, "uploadedDocuments.filename": originalName },
                    { $set: { "uploadedDocuments.$.kgStatus": kgSkipReason } }
                ).catch(e => console.error("DB update error for KG skipped (background):", e));
            }

            // Optional: Delete the physical uploaded file from the 'assets' directory
            // Do this only if the text content is reliably stored in MongoDB (ragResult.text)
            // and workers have what they need (text or chunk data).
            if (absoluteFilePath) {
                console.log(`[Upload Route BG] Attempting to delete temporary uploaded file: ${absoluteFilePath} as processing is fully offloaded.`);
                await fs.promises.unlink(absoluteFilePath)
                    .catch(e => console.error(`[Upload Route BG] Non-critical: Failed to delete temp file ${absoluteFilePath} after offloading: ${e.message}`));
                absoluteFilePath = null; // Mark as deleted
            }

        } catch (processError) {
            // This catch block handles errors from STAGE 1, 2, or 2.5, or any unhandled synchronous error
            console.error(`Upload Route: !!! Overall processing error for ${originalName || 'unknown file'} (User: '${username}'):`, processError.message, processError.stack);
            if (absoluteFilePath) { // If file path is known, try to delete it
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload Route Cleanup: Error deleting file (overall fail): ${e.message}`));
            }
            // If res hasn't been sent (e.g., error before 202 response)
            if (!res.headersSent) {
                return res.status(500).json({
                    message: `Server error during file processing: ${processError.message || 'Unknown error.'}`,
                    filename: serverFilename, // May be null if error was very early
                    originalname: originalName // May be null
                });
            } else {
                // If response was already sent, we can only log the error.
                // A separate mechanism might be needed to update the user/DB about this failure.
                console.error(`Upload Route: Error occurred for ${originalName} after 202 response was sent. This indicates a problem in the background initiation logic itself or unhandled promise rejection before workers fully take over.`);
            }
        }
    }); 
});



module.exports = router;
