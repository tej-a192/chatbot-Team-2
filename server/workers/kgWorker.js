// server/workers/kgWorker.js
const { workerData, parentPort } = require('worker_threads');
const mongoose = require('mongoose');

// --- Models and Services ---
const User = require('../models/User');
const AdminDocument = require('../models/AdminDocument'); // Import AdminDocument model
const connectDB = require('../config/db');
const kgService = require('../services/kgService');

async function runKgGeneration() {
    // --- Destructure all possible fields from workerData ---
    const { chunksForKg, userId, originalName, llmProvider, ollamaModel, adminDocumentId } = workerData;
    
    let dbConnected = false;
    let overallSuccess = false;
    let finalMessage = "KG processing encountered an issue.";
    const logPrefix = `[KG Worker ${process.pid}, Doc: ${originalName}]`;

    try {
        console.log(`${logPrefix} Received task. User/Context: '${userId}'. Chunks: ${chunksForKg ? chunksForKg.length : 0}`);
        if (!process.env.MONGO_URI) throw new Error("MONGO_URI not set in KG worker environment.");
        if (!userId || !originalName) throw new Error("Missing userId or originalName in workerData.");

        await connectDB(process.env.MONGO_URI);
        dbConnected = true;
        console.log(`${logPrefix} DB Connected.`);

        // --- THIS IS THE CORE REFACTORING LOGIC ---
        // Determine which model to update based on the presence of adminDocumentId
        const isProcessingAdminDoc = !!adminDocumentId;
        const ModelToUpdate = isProcessingAdminDoc ? AdminDocument : User;
        const findQuery = isProcessingAdminDoc ? { _id: adminDocumentId } : { _id: userId, "uploadedDocuments.filename": originalName };
        const statusUpdateField = isProcessingAdminDoc ? "kgStatus" : "uploadedDocuments.$.kgStatus";

        await ModelToUpdate.updateOne(findQuery, { $set: { [statusUpdateField]: "processing" } });
        console.log(`${logPrefix} Status set to 'processing' for ${isProcessingAdminDoc ? 'admin document' : 'user document'}.`);

        if (!chunksForKg || chunksForKg.length === 0) {
            finalMessage = "No chunks provided for KG generation.";
            await ModelToUpdate.updateOne(findQuery, { $set: { [statusUpdateField]: "skipped_no_chunks", kgTimestamp: new Date() } });
            overallSuccess = true;
        } else {
            const kgExtractionResult = await kgService.generateAndStoreKg(chunksForKg, userId, originalName, llmProvider, ollamaModel);

            if (kgExtractionResult && kgExtractionResult.success) {
                const updatePayload = {
                    [isProcessingAdminDoc ? "kgStatus" : "uploadedDocuments.$.kgStatus"]: "completed",
                    [isProcessingAdminDoc ? "kgNodesCount" : "uploadedDocuments.$.kgNodesCount"]: kgExtractionResult.finalKgNodesCount,
                    [isProcessingAdminDoc ? "kgEdgesCount" : "uploadedDocuments.$.kgEdgesCount"]: kgExtractionResult.finalKgEdgesCount,
                    [isProcessingAdminDoc ? "kgTimestamp" : "uploadedDocuments.$.kgTimestamp"]: new Date()
                };
                await ModelToUpdate.updateOne(findQuery, { $set: updatePayload });
                overallSuccess = true;
                finalMessage = kgExtractionResult.message || "KG generation and storage completed successfully.";
            } else {
                await ModelToUpdate.updateOne(findQuery, { $set: { [statusUpdateField]: "failed_extraction" } });
                finalMessage = kgExtractionResult?.message || "KG detailed extraction or storage failed.";
                overallSuccess = false;
            }
        }

        if (parentPort) {
            parentPort.postMessage({ success: overallSuccess, originalName, message: finalMessage });
        }

    } catch (error) {
        console.error(`${logPrefix} CRITICAL error:`, error);
        finalMessage = error.message || "Unknown critical error in KG worker.";
        overallSuccess = false;
        if (dbConnected && (userId || adminDocumentId)) {
            try {
                const isProcessingAdminDoc = !!adminDocumentId;
                const ModelToUpdate = isProcessingAdminDoc ? AdminDocument : User;
                const findQuery = isProcessingAdminDoc ? { _id: adminDocumentId } : { _id: userId, "uploadedDocuments.filename": originalName };
                const statusUpdateField = isProcessingAdminDoc ? "kgStatus" : "uploadedDocuments.$.kgStatus";
                await ModelToUpdate.updateOne(findQuery, { $set: { [statusUpdateField]: "failed_critical" } });
            } catch (dbUpdateError) {
                console.error(`${logPrefix} DB update error on critical fail:`, dbUpdateError);
            }
        }
    } finally {
        if (dbConnected) {
            await mongoose.disconnect();
        }
        console.log(`${logPrefix} Finished task. Overall Success: ${overallSuccess}`);
    }
}

runKgGeneration();