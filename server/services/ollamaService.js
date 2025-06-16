// server/services/ollamaService.js
const axios = require('axios');

const OLLAMA_BASE_URL = process.env.OLLAMA_API_BASE_URL || 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3';

const DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_CHAT = 4096;
const DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_KG = 8192;

function formatMessagesForOllamaChat(chatHistory, systemPromptText) {
    const messages = [];
    if (systemPromptText && systemPromptText.trim() !== "") {
        messages.push({ role: "system", content: systemPromptText.trim() });
    }
    chatHistory.forEach(msg => {
        messages.push({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: (Array.isArray(msg.parts) && msg.parts[0]?.text) ? msg.parts[0].text : (msg.text || "")
        });
    });
    return messages;
}

const generateContentWithHistory = async (
    chatHistory, // This should include the current user query as the last message for /api/chat
    systemPromptText = null, // This is the "overall" system prompt
    options = {} // { model, maxOutputTokens, apiKey (for secured Ollama instances) }
) => {
    const modelToUse = options.model || DEFAULT_OLLAMA_MODEL;
    const effectiveMaxOutputTokens = options.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_CHAT;
    
    const messagesForOllama = formatMessagesForOllamaChat(chatHistory, systemPromptText);
    if (messagesForOllama.length === 0 || (messagesForOllama.length === 1 && messagesForOllama[0].role === 'system')) {
        throw new Error("Ollama: Chat history (excluding system prompt) must be non-empty for /api/chat.");
    }

    const requestPayload = {
        model: modelToUse,
        messages: messagesForOllama,
        stream: false,
        options: {
            temperature: options.temperature || 0.7,
            num_predict: effectiveMaxOutputTokens,
        }
    };
    
    const endpoint = `${OLLAMA_BASE_URL}/api/chat`;
    const headers = { 'Content-Type': 'application/json' };
    if (options.apiKey) { 
        headers['Authorization'] = `Bearer ${options.apiKey}`;
    }
    console.log(`Ollama Service: Sending request to ${endpoint} for model ${modelToUse}. Messages count: ${messagesForOllama.length}`);

    try {
        const response = await axios.post(endpoint, requestPayload, { 
            headers,
            timeout: 120000 
        });

        if (response.data && response.data.message && typeof response.data.message.content === 'string') {
            if (response.data.done === false && response.data.done_reason === 'length') {
                 console.warn(`Ollama response for model ${modelToUse} may have been truncated due to length.`);
            }
            return response.data.message.content.trim();
        } else {
            console.error("Ollama API Error: Invalid response structure from /api/chat.", response.data);
            throw new Error("Ollama service returned an invalid response structure.");
        }
    } catch (error) {
        console.error("Ollama API Call Error:", error.message);
        let clientMessage = "Failed to get response from Ollama AI service.";
        if (error.response) {
            console.error("Ollama Error Response Data:", error.response.data);
            clientMessage = `Ollama Service Error: ${error.response.data.error || (error.response.data.message ? error.response.data.message.content : error.message)}`;
        } else if (error.request) {
            clientMessage = "No response received from Ollama service. Check if it's running and accessible.";
        }
        const enhancedError = new Error(clientMessage);
        enhancedError.status = error.response?.status || 503;
        enhancedError.originalError = error;
        throw enhancedError;
    }
};

module.exports = {
    generateContentWithHistory,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_CHAT,
    DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_KG,
};