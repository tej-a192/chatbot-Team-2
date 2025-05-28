// File: server/workers/kgWorker.js
const { workerData, parentPort } = require('worker_threads');

// Adjust the path to YOUR kgService.js file
// If kgWorker.js is in 'server/workers/' and kgService.js is in 'server/services/'
// then the path would be '../services/kgService'.
const kgService = require('../services/kgService'); // <<<< IMPORTANT: CHECK THIS PATH

async function runKgGeneration() {
    const { chunksForKg, userId, originalName } = workerData;

    console.log(`[KG Worker ${process.pid}] Received task. Starting KG generation via kgService for:`);
    console.log(`  User ID: ${userId}`);
    console.log(`  Original Filename: ${originalName}`);
    console.log(`  Number of Chunks: ${chunksForKg ? chunksForKg.length : 0}`);

    try {
        if (!chunksForKg || chunksForKg.length === 0) {
            throw new Error("No chunksForKg provided to worker.");
        }

        // Call the main function from your kgService
        const result = await kgService.generateAndStoreKg(chunksForKg, userId, originalName);

        if (result && result.success) {
            console.log(`[KG Worker ${process.pid}] KG generation successful for document: ${originalName}`);
            if (parentPort) {
                parentPort.postMessage({
                    success: true,
                    message: "KG generation completed successfully by worker.",
                    // Optionally, send back a summary if needed by the main thread
                    // knowledgeGraphSummary: {
                    //     nodes: result.knowledgeGraph.nodes.length,
                    //     edges: result.knowledgeGraph.edges.length
                    // }
                });
            }
        } else {
            const errorMessage = (result && result.message) ? result.message : "KG generation process failed in service or returned no result.";
            console.error(`[KG Worker ${process.pid}] KG generation failed for document: ${originalName}. Error: ${errorMessage}`);
            if (parentPort) {
                parentPort.postMessage({
                    success: false,
                    error: errorMessage,
                    document: originalName
                });
            }
        }
    } catch (error) {
        console.error(`[KG Worker ${process.pid}] Critical error during KG generation task for document: ${originalName}:`, error);
        if (parentPort) {
            parentPort.postMessage({
                success: false,
                error: error.message || "Unknown critical error in KG worker.",
                document: originalName
            });
        }
    } finally {
        // If not using parentPort.postMessage , the worker might exit.
        // If parentPort is used, the main thread controls when the worker instance might be terminated
        // or if the worker should explicitly close itself (e.g., if it's designed for one-off tasks).
        // For simple fire-and-forget, this is okay.
        if (!parentPort) { // If run directly, not as a worker
            process.exit(error ? 1 : 0);
        }
    }
}

// Start the generation process when the worker is invoked
runKgGeneration();