// server/controllers/generationController.js
const documentGenerator = require('../services/documentGenerator');
const { callGemini, callOllama } = require('../services/llmService');
const { DOCX_EXPANSION_PROMPT_TEMPLATE, PPTX_EXPANSION_PROMPT_TEMPLATE } = require('../config/promptTemplates');
const { getLlmChoice } = require('../utils/utils');

// Handler for generating docs from markdown (from Analysis panel)
exports.generateDocument = async (req, res) => {
    const { markdownContent, docType, sourceDocumentName } = req.body;
    try {
        const { buffer, filename } = await documentGenerator.createDocument(
            markdownContent,
            docType,
            sourceDocumentName
        );
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', docType === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
    } catch (error) {
        console.error(`Error generating document from markdown:`, error);
        res.status(500).json({ message: "Failed to generate document.", error: error.message });
    }
};

// Handler for generating docs from a topic (from main chat agent)
exports.generateDocumentFromTopic = async (req, res) => {
    const { topic, docType } = req.body;
    const user = req.user;

    try {
        console.log(`[GenController] Generating ${docType} for topic: "${topic}"`);
        const { llmChoice, model, apiKey, ollamaUrl } = getLlmChoice(user);
        const llmCallFunction = llmChoice === 'gemini' ? callGemini : callOllama;

        // Step 1: Use LLM to generate the markdown content for the document
        const template = docType === 'pptx' ? PPTX_EXPANSION_PROMPT_TEMPLATE : DOCX_EXPANSION_PROMPT_TEMPLATE;
        const prompt = template
            .replace('{source_document_text', 'General knowledge.') // Source text isn't available in this flow
            .replace('{outline_content}', `A document about: ${topic}`);

        console.log("[GenController] Calling LLM to generate document content...");
        const markdownContent = await llmCallFunction({
            systemPrompt: prompt,
            userPrompt: `Generate the content for the topic: "${topic}"`,
            history: [],
            model,
            apiKey,
            ollamaUrl,
            json: docType === 'pptx' // Only force JSON for PPTX
        });
        
        console.log("[GenController] LLM content received. Now creating file buffer...");
        // Step 2: Use the document generator service to create the file from the generated content
        const { buffer, filename } = await documentGenerator.createDocument(
            markdownContent,
            docType,
            topic // Use topic for the filename base
        );

        // Step 3: Set headers and send the file buffer
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', docType === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
        console.log(`[GenController] Successfully sent ${filename} to user.`);

    } catch (error) {
        console.error(`Error generating document from topic:`, error);
        res.status(500).json({ message: "Failed to generate document from topic.", error: error.message });
    }
};