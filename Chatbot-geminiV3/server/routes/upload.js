// server/routes/upload.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { tempAuth } = require('../middleware/authMiddleware');
const User = require('../models/User'); // Import the User model
const { ANALYSIS_PROMPTS } = require('../config/promptTemplates'); 
const geminiService = require('../services/geminiService');
const { threadId } = require('worker_threads');
const { log } = require('console');
const { Worker } = require('worker_threads');

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
        // tempAuth middleware ensures req.user exists here
        if (!req.user || !req.user.username) {
            // This should ideally not happen if tempAuth works correctly
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
    // tempAuth middleware should run before this, ensuring req.user exists
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
        console.error("PYTHON_RAG_SERVICE_URL is not set.");
        return { success: false, message: "RAG service URL not configured.", text: null, chunksForKg: [], status: null };
    }
    const addDocumentUrl = `${pythonServiceUrl}/add_document`;
    // console.log(`RAG Trigger: Calling Python for ${originalName} (User: ${userId}) at ${addDocumentUrl}`);

    try {
        const response = await axios.post(addDocumentUrl, {
            user_id: userId,
            file_path: filePath,
            original_name: originalName
        }, { timeout: 300000 }); // 5 min timeout

        const pythonData = response.data;
        // console.log(`RAG Trigger: Raw Python response for ${originalName}:`, pythonData);

        const text = pythonData?.raw_text_for_analysis || null;
        const chunksForKg = pythonData?.chunks_with_metadata || [];
        const pythonStatus = pythonData?.status;
        const pythonMessage = pythonData?.message || "No message from Python RAG service.";

        if (pythonStatus === 'added' || pythonStatus === 'skipped') {
            return {
                success: true,
                status: pythonStatus,
                message: pythonMessage,
                text: text,
                chunksForKg: chunksForKg,
            };
        } else {
            console.warn(`RAG Trigger: Unexpected status '${pythonStatus}' from Python for ${originalName}.`);
            return {
                success: false,
                message: `Unexpected RAG status: ${pythonStatus}. ${pythonMessage}`,
                text: text, chunksForKg: chunksForKg, status: pythonStatus,
            };
        }
    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message || "Unknown RAG service error";
        console.error(`RAG Trigger: Error calling Python for ${originalName}:`, errorMsg);
        return { success: false, message: `RAG service call failed: ${errorMsg}`, text: null, chunksForKg: [], status: 'error' };
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



router.post('/', tempAuth, (req, res) => {
    const uploader = upload.single('file');

    uploader(req, res, async function (err) {
        if (!req.user) {
            console.error("Upload: User context missing.");
            return res.status(401).json({ message: "Authentication error." });
        }
        const userId = req.user._id.toString();
        const username = req.user.username;

        let absoluteFilePath = null;
        let originalName = null;
        let serverFilename = null;

        if (err) {
            console.error(`Upload: Multer error for user '${username}': ${err.message}`);
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ message: err.message });
            }
            return res.status(500).json({ message: "Server error during upload prep." });
        }

        if (!req.file) {
            console.warn(`Upload: No file received for user '${username}'.`);
            return res.status(400).json({ message: "No file received." });
        }

        absoluteFilePath = path.resolve(req.file.path);
        originalName = req.file.originalname;
        serverFilename = req.file.filename;
        console.log(`Upload: Received for user '${username}', File: ${serverFilename}, Original: ${originalName}`);

        try {
            // ----- STAGE 1: MongoDB Pre-check -----
            const userForPreCheck = await User.findById(userId).select('uploadedDocuments');
            if (!userForPreCheck) {
                console.error(`Upload: User ${userId} ('${username}') not found. Deleting ${absoluteFilePath}`);
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload: Cleanup error (user not found): ${e.message}`));
                return res.status(404).json({ message: "User not found." });
            }
            const existingDocument = userForPreCheck.uploadedDocuments.find(doc => doc.filename === originalName);
            if (existingDocument) {
                console.log(`Upload: '${originalName}' already exists for '${username}'. Deleting ${absoluteFilePath}`);
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload: Cleanup error (duplicate): ${e.message}`));
                return res.status(409).json({
                    message: `File '${originalName}' already exists.`,
                    filename: serverFilename, originalname: originalName,
                });
            }
            console.log(`Upload: Pre-check passed for '${originalName}' (User: '${username}').`);


            // ----- STAGE 2: RAG Processing (Get data from Python) -----
            const ragResult = await triggerPythonRagProcessing(userId, absoluteFilePath, originalName);
            // ragResult now contains: { success, status, text, chunksForKg, message }

            if (!ragResult.success || ragResult.status !== 'added' || !ragResult.text || ragResult.text.trim() === '') {
                const errorMessage = (ragResult && ragResult.message) || "RAG processing failed or returned insufficient data from Python.";
                console.error(`Upload Route Error: RAG failed for '${originalName}' (User: '${username}'): ${errorMessage}. Status: ${ragResult.status}. Deleting file.`);
                if (absoluteFilePath) {
                    await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload Route: Cleanup error (RAG fail): ${e.message}`));
                }
                return res.status(500).json({ message: errorMessage, filename: serverFilename, originalname: originalName });
            }
            console.log(`RAG Stage: Python OK for '${originalName}'. Text obtained. Status: ${ragResult.status}.`);


            // ----- STAGE 2.5: Initial MongoDB Save for the Document Entry -----
            // This creates the document shell with the text from RAG.
            const newDocumentEntryData = {
                filename: originalName, // This is the key for future updates
                text: ragResult.text, // Save the text obtained from RAG
                // Initialize analysis object as per your schema
                analysis: {
                    faq: "",
                    topics: "",
                    mindmap: "",
                },
                // You might want to add uploadedAt, ragStatus, initial analysisStatus, kgStatus here
                uploadedAt: new Date(),
                ragStatus: ragResult.status,
                analysisStatus: "pending",
                kgStatus: "pending"
            };

            try {
                const updateResult = await User.updateOne(
                    { _id: userId },
                    { $push: { uploadedDocuments: newDocumentEntryData } }
                );

                if (updateResult.modifiedCount === 0 && updateResult.matchedCount === 1) {
                    // This could happen if the user doc was matched but $push didn't modify (e.g. arrayFilters condition failed, though not used here)
                    // Or if the exact same subdocument was somehow pushed again without erroring (unlikely for $push without specific checks)
                    console.warn(`DB Save: Initial document entry for '${originalName}' pushed, but modifiedCount is 0. This might indicate an issue or an idempotent push.`);
                } else if (updateResult.matchedCount === 0) {
                     throw new Error("User not found for saving initial document entry.");
                }
                console.log(`DB Save: Initial document entry for '${originalName}' added to user '${username}'.`);
            } catch (dbError) {
                console.error(`Upload Route Error: MongoDB error saving initial doc for '${originalName}': ${dbError.message}. Deleting file.`);
                if (absoluteFilePath) {
                    await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload Route: Cleanup error (initial DB save fail): ${e.message}`));
                }
                return res.status(500).json({ message: `Database error saving document: ${dbError.message}`, filename: serverFilename, originalname: originalName });
            }
            // At this point, the document shell with filename and text is in the DB.
            // We don't need to retrieve its _id for this flow.

            // Optional: Delete physical file now if content is in DB
            // await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload Route: Cleanup error (post-initial save): ${e.message}`));
            // absoluteFilePath = null;

            console.log(`Initial DB Save: Completed for '${originalName}' (User: '${username}'). Proceeding to analysis.`);



            // ----- STAGE 3: Analysis Generation -----
            const analysisOutcome = await triggerAnalysisGeneration(userId, originalName, ragResult.text);

            // ----- STAGE 4: Handle Analysis Outcome & DB Update -----
            if (analysisOutcome.success) {
                // Use originalName for logging context now
                console.log(`Analysis: Generated successfully for '${originalName}' (User: '${username}'). Storing.`);
                await User.updateOne(
                    // Query to find the user and the specific subdocument by filename
                    { _id: userId, "uploadedDocuments.filename": originalName },
                    {
                        $set: {
                            "uploadedDocuments.$.analysis.faq": analysisOutcome.results.faq,
                            "uploadedDocuments.$.analysis.topics": analysisOutcome.results.topics,
                            "uploadedDocuments.$.analysis.mindmap": analysisOutcome.results.mindmap,
                            "uploadedDocuments.$.analysisStatus": "completed"
                        }
                    }
                );
            } else {
                console.warn(`Analysis: Failed for '${originalName}' (User: '${username}'). Storing partial/error state.`);
                await User.updateOne(
                    { _id: userId, "uploadedDocuments.filename": originalName },
                    {
                        $set: {
                            "uploadedDocuments.$.analysis.faq": analysisOutcome.results.faq,
                            "uploadedDocuments.$.analysis.topics": analysisOutcome.results.topics,
                            "uploadedDocuments.$.analysis.mindmap": analysisOutcome.results.mindmap,
                            "uploadedDocuments.$.analysisStatus": "failed"
                        }
                    }
                );
            }

            // ----- STAGE 4: KG Worker Initiation -----
            let kgWorkerInitiated = false;
            // Condition for KG: RAG was successful (status 'added'), and chunks are available.
            // The initial document entry is already saved in STAGE 2.5.
            if (ragResult.status === "added" &&
                ragResult.chunksForKg && ragResult.chunksForKg.length > 0) {

                console.log(`KG Init: Conditions met for '${originalName}' (User: '${username}').`);
                const workerScriptPath = path.resolve(__dirname, '../workers/kgWorker.js');

                try {
                    const worker = new Worker(workerScriptPath, {
                        workerData: {
                            chunksForKg: ragResult.chunksForKg,
                            userId: userId,
                            originalName: originalName,
                            // documentIdInDb is no longer strictly needed if KG service uses userId/originalName to update DB
                            // but can be passed as originalName for context if kgService expects a document identifier
                        }
                    });
                    kgWorkerInitiated = true;
                    worker.on('message', (msg) => console.log(`KG Worker [Context ${msg.documentId}]: ${msg.message || JSON.stringify(msg)}`));
                    worker.on('error', (workerErr) => console.error(`KG Worker Error [Context ${originalName}]:`, workerErr));
                    worker.on('exit', (code) => console.log(`KG Worker [Context ${originalName}] exited (code ${code}).`));
                    console.log(`KG Init: Worker for '${originalName}' launched.`);
                } catch (workerLaunchError) {
                    kgWorkerInitiated = false;
                    console.error(`KG Init: Failed to launch worker for '${originalName}':`, workerLaunchError);
                }
            } else {
                console.log(`KG Init: Not triggered for '${originalName}'. RAG Status: ${ragResult.status}, Chunks: ${ragResult.chunksForKg ? ragResult.chunksForKg.length : 'N/A'}`);
            }

            // ----- Final Response to Client -----
            const analysisMessage = analysisOutcome.success ? 'completed' : 'failed';
            const kgMessage = kgWorkerInitiated ? 'initiated' : 'not triggered';
            const finalUserMessage = `File processed. Analysis: ${analysisMessage}. KG generation: ${kgMessage}.`;

            // We no longer have a specific subDocumentId to return from this main flow.
            // The client can refer to the document by its originalName.
            return res.status(analysisOutcome.success ? 200 : 422).json({
                message: finalUserMessage,
                filename: serverFilename, // The name on disk
                originalname: originalName,     // The original name uploaded by user
                analysisStatus: analysisMessage,
                kgInitiated: kgWorkerInitiated
            });

        } catch (processError) {
            console.error(`Upload Route: !!! Overall error for ${originalName || 'unknown'} (User: '${username || 'unknown'}'):`, processError.message, processError.stack);
            if (absoluteFilePath) {
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Upload Route: Cleanup error (overall fail): ${e.message}`));
            }
            return res.status(500).json({
                message: `Server error: ${processError.message || 'Unknown error.'}`,
                filename: serverFilename, originalname: originalName
            });
        }
    });
});


module.exports = router;
