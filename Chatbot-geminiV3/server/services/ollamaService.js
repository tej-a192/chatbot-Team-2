// server/services/ollamaService.js
const axios = require('axios');

const OLLAMA_BASE_URL = process.env.OLLAMA_API_BASE_URL || 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_DEFAULT_MODEL || 'llama3'; // Ensure this is set in .env

const DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_CHAT = 4096; // Ollama's equivalent to maxOutputTokens (num_predict)
const DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_KG = 8192;   // Larger for KG tasks

// Helper to format history for Ollama.
// Many models expect a specific format, e.g., Llama 2 chat format.
// This is a generic approach; specific models might need fine-tuning.
function formatHistoryForOllama(chatHistory, systemPromptText) {
    let promptString = "";

    if (systemPromptText && systemPromptText.trim() !== "") {
        // A common way to prepend system prompt for instruct/chat models
        promptString += `System: ${systemPromptText.trim()}\n\n`;
    }

    chatHistory.forEach(msg => {
        const role = msg.role === 'model' ? 'Assistant' : 'User';
        const text = (Array.isArray(msg.parts) && msg.parts[0]?.text) ? msg.parts[0].text : (msg.text || "");
        promptString += `${role}: ${text}\n`;
    });
    // The final prompt to Ollama will append the *current* user message after this history.
    // So, if the last message in chatHistory is the one we want a response to,
    // it should be included as the final "User:" part here.
    // Or, if chatHistory is true history, then the calling function appends the current query.
    return promptString;
}


const generateContentWithHistory = async (
    chatHistory, // Array of { role: 'user'/'model', parts: [{ text: '...' }] }
    systemPromptText = null,
    options = {} // { model, maxOutputTokens }
) => {
    const modelToUse = options.model || DEFAULT_OLLAMA_MODEL;
    const effectiveMaxOutputTokens = options.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS_OLLAMA_CHAT;

    if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
        throw new Error("Ollama: Chat history must be a non-empty array.");
    }

    // The `chatHistory` passed here should *not* include the most recent user message if it's a typical chat flow.
    // That message will be the main "prompt" to Ollama.
    // If `chatHistory` *does* include the final user message, then the prompt below is just that message.

    const historyString = formatHistoryForOllama(chatHistory.slice(0, -1), systemPromptText);
    const currentUserMessage = (chatHistory[chatHistory.length - 1]?.parts?.[0]?.text) || "";

    if (!currentUserMessage.trim()) {
        throw new Error("Ollama: The final user message in history is empty or missing.");
    }
    
    // Construct the full prompt for Ollama
    // Ollama's /api/generate expects a single "prompt" field.
    // History is typically prepended to the current user's message.
    const fullPrompt = historyString + `User: ${currentUserMessage}\nAssistant:`; // Prompt for assistant's turn


    const requestPayload = {
        model: modelToUse,
        prompt: fullPrompt,
        stream: false, // We want the full response
        options: {
            temperature: options.temperature || 0.7,
            num_predict: effectiveMaxOutputTokens, // num_predict is Ollama's way of limiting output length
            // Add other Ollama options here if needed (e.g., top_k, top_p, seed)
        }
    };
    
    // If a system prompt was provided, and the model supports a dedicated 'system' field, use it.
    // Otherwise, it's already prepended in formatHistoryForOllama.
    // For /api/generate, it's usually part of the main prompt.
    // Some models might allow a `system` field in the payload for /api/generate. Check Ollama docs for specific model.
    // if (systemPromptText && systemPromptText.trim() !== "" && modelSupportsSystemField(modelToUse)) {
    //    requestPayload.system = systemPromptText.trim();
    // }


    const endpoint = `${OLLAMA_BASE_URL}/api/generate`;
    console.log(`Ollama Service: Sending request to ${endpoint} for model ${modelToUse}. Prompt (first 100): "${fullPrompt.substring(0, 100)}..."`);

    try {
        const response = await axios.post(endpoint, requestPayload, { timeout: 120000 }); // 2 min timeout

        if (response.data && response.data.response) {
            if (response.data.done === false || response.data.truncated) { // `truncated` might be a custom field or implied by `done: false` if `num_predict` is hit
                 console.warn(`Ollama response for model ${modelToUse} may have been truncated. Done: ${response.data.done}. Context length: ${response.data.context?.length}`);
            }
            return response.data.response.trim();
        } else {
            console.error("Ollama API Error: Invalid response structure.", response.data);
            throw new Error("Ollama service returned an invalid response structure.");
        }
    } catch (error) {
        console.error("Ollama API Call Error:", error.message);
        let clientMessage = "Failed to get response from Ollama AI service.";
        if (error.response) {
            console.error("Ollama Error Response Data:", error.response.data);
            clientMessage = `Ollama Service Error: ${error.response.data.error || error.message}`;
        } else if (error.request) {
            clientMessage = "No response received from Ollama service. Check if it's running and accessible.";
        }
        const enhancedError = new Error(clientMessage);
        enhancedError.status = error.response?.status || 503; // Service Unavailable or other
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