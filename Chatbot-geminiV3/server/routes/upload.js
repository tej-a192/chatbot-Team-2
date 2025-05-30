// server/routes/upload.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { authMiddleware } = require('../middleware/authMiddleware');
const User = require('../models/User'); // Import the User model
const { ANALYSIS_PROMPTS } = require('../config/promptTemplates'); 
const geminiService = require('../services/geminiService');

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
    // Read URL from environment variable set during startup
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        console.error("PYTHON_RAG_SERVICE_URL is not set in environment. Cannot trigger processing.");
        // Optionally: Delete the uploaded file if processing can't be triggered?
        // await fs.promises.unlink(filePath).catch(e => console.error(`Failed to delete unprocessed file ${filePath}: ${e}`));
        return { success: false, message: "RAG service URL not configured." }; // Indicate failure
    }
    const addDocumentUrl = `${pythonServiceUrl}/add_document`;
    console.log(`Triggering Python RAG processing for ${originalName} (User: ${userId}) at ${addDocumentUrl}`);
    try {
        // Send absolute path
        const response = await axios.post(addDocumentUrl, {
            user_id: userId,
            file_path: filePath, // Send the absolute path
            original_name: originalName
        }, { timeout: 300000 }); // 5 minute timeout for processing

        console.log(`Python RAG service response for ${originalName}:`, response.data);

        const text = response.data?.raw_text_for_analysis || ""; // This is initial_extracted_text

        if (response.data?.status === "added" && originalName && userId) {
            try {
                const newDocumentEntry = {
                    filename: originalName,
                    text: text, // Raw text from Python for storage and later re-analysis if needed
                    analysis: { // Initialize analysis object matching schema defaults
                        faq: "",
                        topics: "",
                        mindmap: ""
                    }
                };

                const updatedUser = await User.findByIdAndUpdate(
                    userId,
                    { $push: { uploadedDocuments: newDocumentEntry } },
                    { new: true, runValidators: true }
                );

                if (!updatedUser) {
                    console.error(`Failed to find user with ID ${userId} to save document info for ${originalName}.`);
                    return {
                        success: false,
                        message: `User not found for saving document metadata. Status: ${response.data?.status}`,
                        Text: text, 
                        Status: response.data?.status
                    };
                }
                console.log(`Successfully saved document info ('${originalName}') and raw text to user ${userId}.`);

            } catch (dbError) {
                console.error(`Database error saving document info for ${originalName} (User: ${userId}):`, dbError);
                return {
                    success: false,
                    message: `DB error saving document metadata: ${dbError.message}. Python processing status: ${response.data?.status}`,
                    Text: text, // Still return text if Python provided it
                    Status: response.data?.status
                };
            }
        } 
        else if (originalName && userId) { // If not saving, log why
            console.warn(`Skipping DB update for ${originalName} (User: ${userId}). HTTP Status: ${response.status}, Python Custom Status: ${response.data?.status}.`);
        } 
        else {
            console.warn(`Skipping DB update due to missing originalName or userId. Python Custom Status: ${response.data?.status}`);
        }

        // --- END DATABASE UPDATE ---


        // Check response.data.status ('added' or 'skipped')
        if (response.data?.status === 'skipped') {
             console.warn(`Python RAG service skipped processing ${originalName}: ${response.data.message}`);
             return { success: true, status: 'skipped', message: response.data.message, text: text};
        } else if (response.data?.status === 'added') {
             return { success: true, status: 'added', message: response.data.message, text: text };
        } else {
             console.warn(`Unexpected response status from Python RAG service for ${originalName}: ${response.data?.status}`);
             return { success: false, message: `Unexpected RAG status: ${response.data?.status}` };
        }

    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message || "Unknown RAG service error";
        console.error(`Error calling Python RAG service for ${originalName}:`, errorMsg);
        // Maybe delete the file if the call fails? Depends on retry logic.
        // await fs.promises.unlink(filePath).catch(e => console.error(`Failed to delete file ${filePath} after RAG call error: ${e}`));
        return { success: false, message: `RAG service call failed: ${errorMsg}` }; // Indicate failure
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


// --- Modified Upload Route ---
router.post('/', authMiddleware, (req, res) => {
    const uploader = upload.single('file');

    uploader(req, res, async function (err) { // <<<< ASYNC HERE IS KEY
        if (!req.user) {
             console.error("Upload handler: User context missing.");
             return res.status(401).json({ message: "Authentication error." });
        }
        const userId = req.user._id.toString();

        if (err) {
            // ... (your multer error handling - this part is fine)
            console.error(`Multer error for user ${req.user.username}:`, err.message);
            if (err instanceof multer.MulterError) { /* ... */ return res.status(400).json({ message: err.message || "File upload failed."}); }
            return res.status(500).json({ message: "Server error during upload prep." });
        }
        if (!req.file) {
            console.warn(`No file received for user ${req.user.username}.`);
            return res.status(400).json({ message: "No file received or file type rejected." });
        }

        const { path: filePath, originalname: originalName, filename: serverFilename } = req.file;
        const absoluteFilePath = path.resolve(filePath);
        console.log(`Upload received: User '${req.user.username}', File: ${serverFilename}, Original: ${originalName}`);

        // --- Main Try-Catch for the entire RAG + Analysis process ---
        try {
            // ----- STAGE 1: MongoDB Pre-check for existing originalName -----
            const userForPreCheck = await User.findById(userId).select('uploadedDocuments');
            if (!userForPreCheck) {
                console.error(`Upload Aborted: User ${userId} not found (pre-check). Deleting ${absoluteFilePath}`);
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Cleanup error (user not found): ${e}`));
                return res.status(404).json({ message: "User not found, cannot process upload." });
            }
            const existingDocument = userForPreCheck.uploadedDocuments.find(doc => doc.filename === originalName);
            if (existingDocument) {
                console.log(`Upload Halted: '${originalName}' already exists for user ${userId}. Deleting ${absoluteFilePath}`);
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Cleanup error (duplicate): ${e}`));
                return res.status(409).json({
                    message: `File '${originalName}' already exists. No new processing initiated.`,
                    filename: serverFilename, originalname: originalName,
                });
            }
            console.log(`Pre-check passed for '${originalName}'. Proceeding to RAG.`);
            // ----- END STAGE 1 -----


            // ----- STAGE 2: RAG Processing -----
            const ragResult = await triggerPythonRagProcessing(userId, absoluteFilePath, originalName);

            if (!ragResult.success || !ragResult.text || ragResult.text.trim() === "") {
                let message = `RAG processing failed or returned no text for '${originalName}'.`;
                if (ragResult.message) message += ` Details: ${ragResult.message}`;
                console.error(message + ` (User: ${userId})`);

                // If RAG failed, the file text wasn't added to DB by triggerPythonRagProcessing
                // (assuming triggerPythonRagProcessing only adds to DB on its own success).
                // So, delete the physical file.
                await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Cleanup error (RAG fail/no text) for ${absoluteFilePath}: ${e}`));

                return res.status(500).json({ // Or 422 if it's a content issue from RAG
                    message: message,
                    filename: serverFilename, originalname: originalName
                });
            }
            console.log(`RAG processing completed with text for '${originalName}'. Proceeding to analysis.`);
            // At this point, triggerPythonRagProcessing should have added the document with text to MongoDB.
            // If it didn't, the logic in triggerPythonRagProcessing needs adjustment.


            // ----- STAGE 3: Analysis Generation -----
            const analysisOutcome = await triggerAnalysisGeneration(userId, originalName, ragResult.text);


            // ----- STAGE 4: Handle Analysis Outcome & DB Update -----
            if (analysisOutcome.success) {
                console.log(`All analyses generated successfully for '${originalName}'. Storing in DB.`);
                await User.updateOne(
                    { _id: userId, "uploadedDocuments.filename": originalName },
                    {
                        $set: {
                            "uploadedDocuments.$.analysis.faq": analysisOutcome.results.faq,
                            "uploadedDocuments.$.analysis.topics": analysisOutcome.results.topics,
                            "uploadedDocuments.$.analysis.mindmap": analysisOutcome.results.mindmap,
                        }
                    }
                );
                console.log(`Successfully stored all analyses for '${originalName}' in MongoDB.`);
                return res.status(200).json({
                    message: "File uploaded and all analyses completed successfully.",
                    filename: serverFilename, originalname: originalName,
                    // analysis: analysisOutcome.results // Optionally send analysis back
                });
            } else {
                console.warn(`One or more analyses failed for '${originalName}'. No analysis data from this attempt will be stored in DB.`);
                // The RAG text is already in the DB. This analysis attempt failed.
                // Optionally update a status for this document in DB to indicate analysis failure
                return res.status(422).json({
                    message: "File uploaded and RAG processing complete, but content analysis generation failed. The document text is saved. You may not need to re-upload but can try to trigger analysis again later if such a feature exists, or contact support.",
                    filename: serverFilename, originalname: originalName,
                    // failedAnalysisDetails: analysisOutcome.results // For client-side debugging if needed
                });
            }
        } catch (processError) {
            // Catch any unhandled errors from awaited promises or synchronous code
            console.error(`!!! Overall processing error for ${originalName} (User: ${userId}):`, processError);
            // Try to clean up the uploaded file if it exists and an error occurred.
            // This is a bit tricky as RAG might have already added to DB.
            // If processError is from RAG or before, file deletion is safer.
            // If it's after RAG success but during analysis or DB update of analysis,
            // the RAG text is already in DB.
            if (absoluteFilePath) {
                 // Consider if an error after RAG success should still delete the physical file.
                 // Usually, if the RAG text is in DB, the physical file on disk is secondary.
                 // But if the entire transaction failed, deleting is fine.
                 await fs.promises.unlink(absoluteFilePath).catch(e => console.error(`Cleanup error (overall fail) for ${absoluteFilePath}: ${e}`));
            }
            return res.status(500).json({
                message: `Server error during file processing: ${processError.message}`,
                filename: serverFilename, originalname: originalName
            });
        }
    });
});


module.exports = router;
