// server/services/documentGenerationService.js
const axios = require('axios');
const User = require('../models/User');
const KnowledgeSource = require('../models/KnowledgeSource');
const AdminDocument = require('../models/AdminDocument');
const { decrypt } = require('../utils/crypto');

async function getContextText(userId, contextSource, documentContextName, chatHistory) {
    if (contextSource === 'selected_document' && documentContextName) {
        // Try user's knowledge sources first
        const userSource = await KnowledgeSource.findOne({ userId, title: documentContextName }).select('textContent');
        if (userSource?.textContent) return userSource.textContent;
        // Fallback to admin subjects
        const adminDoc = await AdminDocument.findOne({ originalName: documentContextName }).select('text');
        if (adminDoc?.text) return adminDoc.text;
        throw new Error(`Selected document '${documentContextName}' not found.`);
    }
    if (contextSource === 'chat_history') {
        return chatHistory.map(msg => `${msg.role}: ${msg.parts[0].text}`).join('\n---\n');
    }
    // If context_source is 'none' or another value, but a topic was provided.
    // This allows generation on a topic without explicit context.
    if (contextSource === 'none') {
        return "No specific document context was provided. Generate the document based on your general knowledge about the topic.";
    }
    throw new Error('A valid context (either a selected document, chat history, or none) is required.');
}

async function generateAndProxyDocument(userId, topic, doc_type, context_source, chatHistory, documentContextName) {
    console.log(`[DocGen Service] Starting generation for topic: "${topic}", type: ${doc_type}`);
    
    const contextText = await getContextText(userId, context_source, documentContextName, chatHistory);

    const user = await User.findById(userId).select('+encryptedApiKey');
    const apiKey = user?.encryptedApiKey ? decrypt(user.encryptedApiKey) : process.env.GEMINI_API_KEY;

    if (!apiKey) throw new Error("API key for generation is not available.");

    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) throw new Error("Generation service is not configured.");

    const generationUrl = `${pythonServiceUrl}/generate_document_from_context`;

    const response = await axios.post(generationUrl, {
        topic,
        doc_type,
        context_text: contextText,
        api_key: apiKey
    }, { timeout: 300000 }); // 5 min timeout

    if (!response.data?.success || !response.data?.filename) {
        throw new Error("Python service failed to create the document.");
    }
    
    console.log(`[DocGen Service] Python created file: ${response.data.filename}`);
    return {
        filename: response.data.filename,
        docType: doc_type,
        title: `Document for: ${topic}`
    };
}

module.exports = { generateAndProxyDocument };