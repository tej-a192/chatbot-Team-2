

// server/workers/analysisWorker.js
const { workerData, parentPort } = require('worker_threads');
const mongoose = require('mongoose');
const path = require('path');

const User = require('../models/User');
const connectDB = require('../config/db');
const geminiService = require('../services/geminiService');
const ollamaService = require('../services/ollamaService');
const { ANALYSIS_PROMPTS } = require('../config/promptTemplates');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

async function performFullAnalysis(userId, originalName, textForAnalysis, llmProvider, ollamaModel, apiKey, ollamaUrl) {
    const logPrefix = `[Analysis Worker ${process.pid}, Doc: ${originalName}]`;
    console.log(`${logPrefix} Starting analysis. Using provider: ${llmProvider}`);

    const analysisResults = { faq: "", topics: "", mindmap: "" };
    let allIndividualAnalysesSuccessful = true;

    if (llmProvider === 'gemini' && !apiKey) {
        const errorMessage = "Error: Analysis failed because no valid user Gemini API key was provided to the worker.";
        console.error(`${logPrefix} ${errorMessage}`);
        return { 
            success: false, 
            results: { faq: errorMessage, topics: errorMessage, mindmap: errorMessage }
        };
    }

    async function generateSingleAnalysis(type, promptContentForLLM) {
        try {
            console.log(`${logPrefix} Generating ${type} for '${originalName}'.`);
            const historyForLLM = [{ role: 'user', parts: [{ text: "Perform the requested analysis based on the system instruction provided." }] }];
            
            const llmOptions = { 
                apiKey,
                ollamaUrl,
                model: ollamaModel,
                maxOutputTokens: ollamaService.DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_CHAT
            };

            const generatedText = llmProvider === 'ollama'
                ? await ollamaService.generateContentWithHistory(historyForLLM, promptContentForLLM, null, llmOptions)
                : await geminiService.generateContentWithHistory(historyForLLM, promptContentForLLM, null, llmOptions);

            if (!generatedText || typeof generatedText !== 'string' || generatedText.trim() === "") {
                console.warn(`${logPrefix} LLM returned empty content for ${type}.`);
                return { success: false, content: `Notice: No content generated for ${type}.` };
            }
            console.log(`${logPrefix} ${type} generation successful.`);
            return { success: true, content: generatedText.trim() };
        } catch (error) {
            console.error(`${logPrefix} Error during ${type} generation: ${error.message}`);
            allIndividualAnalysesSuccessful = false;
            return { success: false, content: `Error generating ${type}: ${error.message.substring(0, 250)}` };
        }
    }

    const analysisPromises = [
        generateSingleAnalysis('FAQ', ANALYSIS_PROMPTS.faq.getPrompt(textForAnalysis)),
        generateSingleAnalysis('Topics', ANALYSIS_PROMPTS.topics.getPrompt(textForAnalysis)),
        generateSingleAnalysis('Mindmap', ANALYSIS_PROMPTS.mindmap.getPrompt(textForAnalysis))
    ];
    const outcomes = await Promise.allSettled(analysisPromises);

    outcomes.forEach((outcome, index) => {
        const type = ['faq', 'topics', 'mindmap'][index];
        if (outcome.status === 'fulfilled') {
            analysisResults[type] = outcome.value.content;
            if (!outcome.value.success) allIndividualAnalysesSuccessful = false;
        } else {
            analysisResults[type] = `Error generating ${type}: ${outcome.reason?.message?.substring(0,100) || 'Promise rejected'}`;
            allIndividualAnalysesSuccessful = false;
        }
    });
    
    const finalAnalysisStatus = allIndividualAnalysesSuccessful ? "completed" : "failed_partial";
    try {
        await User.updateOne(
            { _id: userId, "uploadedDocuments.filename": originalName },
            {
                $set: {
                    "uploadedDocuments.$.analysis.faq": analysisResults.faq,
                    "uploadedDocuments.$.analysis.topics": analysisResults.topics,
                    "uploadedDocuments.$.analysis.mindmap": analysisResults.mindmap,
                    "uploadedDocuments.$.analysisStatus": finalAnalysisStatus,
                    "uploadedDocuments.$.analysisTimestamp": new Date()
                }
            }
        );
        console.log(`${logPrefix} Analysis results (Status: ${finalAnalysisStatus}) stored in DB.`);
        return { success: allIndividualAnalysesSuccessful, message: `Analysis ${allIndividualAnalysesSuccessful ? 'completed' : 'completed with some failures'}.` };
    } catch (dbError) {
        console.error(`${logPrefix} DB Error storing analysis results:`, dbError);
        return { success: false, message: `DB Error storing analysis: ${dbError.message}` };
    }
}

async function run() {
    const { userId, originalName, textForAnalysis, llmProvider, ollamaModel, apiKey, ollamaUrl } = workerData;
    let dbConnected = false;
    let overallTaskSuccess = false;
    let finalMessageToParent = "Analysis worker encountered an issue.";

    try {
        if (!process.env.MONGO_URI || !userId || !originalName) {
            throw new Error("Worker started with incomplete data (MONGO_URI, userId, or originalName missing).");
        }
        
        await connectDB(process.env.MONGO_URI);
        dbConnected = true;
        await User.updateOne(
            { _id: userId, "uploadedDocuments.filename": originalName },
            { $set: { "uploadedDocuments.$.analysisStatus": "processing" } }
        );

        if (!textForAnalysis || textForAnalysis.trim() === '') {
            await User.updateOne(
                { _id: userId, "uploadedDocuments.filename": originalName },
                { $set: { "uploadedDocuments.$.analysisStatus": "skipped_no_text", "uploadedDocuments.$.analysisTimestamp": new Date() } }
            );
            overallTaskSuccess = true;
            finalMessageToParent = "Analysis skipped: No text provided.";
        } else {
            const result = await performFullAnalysis(
                userId, originalName, textForAnalysis, llmProvider, ollamaModel, apiKey, ollamaUrl
            );
            overallTaskSuccess = result.success;
            finalMessageToParent = result.message;
        }

        if (parentPort) {
            parentPort.postMessage({ success: overallTaskSuccess, originalName, message: finalMessageToParent });
        }

    } catch (error) {
        console.error(`[Analysis Worker] Critical error for '${originalName}':`, error);
        finalMessageToParent = error.message;
        if (dbConnected && userId && originalName) {
            try {
                await User.updateOne(
                    { _id: userId, "uploadedDocuments.filename": originalName },
                    { $set: { "uploadedDocuments.$.analysisStatus": "failed_critical" } }
                );
            } catch (dbUpdateError) {
                console.error(`[Analysis Worker] Failed to update status to 'failed_critical':`, dbUpdateError);
            }
        }
        if (parentPort) {
            parentPort.postMessage({ success: false, originalName, error: finalMessageToParent });
        }
    } finally {
        if (dbConnected) {
            await mongoose.disconnect();
        }
        console.log(`[Analysis Worker] Finished task for ${originalName}. Success: ${overallTaskSuccess}`);
    }
}

run();
