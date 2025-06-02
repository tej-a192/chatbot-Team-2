// server/services/geminiService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-1.5-flash"; // Or "gemini-1.5-pro" if you switch

if (!API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not available in the environment. Server should have exited.");
    throw new Error("GEMINI_API_KEY is missing.");
}

const genAI = new GoogleGenerativeAI(API_KEY);

const DEFAULT_MAX_OUTPUT_TOKENS_CHAT = 8192; // Increased default for potentially longer thinking + answer
const DEFAULT_MAX_OUTPUT_TOKENS_KG = 65536;   // Default specific for KG, might need adjustment

const baseSafetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// Modified function to accept maxTokens override
const generateContentWithHistory = async (
    chatHistory,
    systemPromptText = null,
    customMaxOutputTokens = null 
) => {
    try {
        if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
             throw new Error("Chat history must be a non-empty array.");
        }
        // It's good practice to ensure history ends with a user role for many models
        // if (chatHistory[chatHistory.length - 1].role !== 'user') {
        //     console.warn("Warning: Chat history for Gemini API call does not end with a 'user' role. This might lead to unexpected behavior. Last role:", chatHistory[chatHistory.length - 1].role);
        // }

        const effectiveMaxOutputTokens = customMaxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS_CHAT;

        const generationConfig = {
            temperature: 0.7, // Or make this configurable too
            maxOutputTokens: effectiveMaxOutputTokens,
        };

        const modelOptions = {
            model: MODEL_NAME,
            generationConfig: generationConfig,
            safetySettings: baseSafetySettings,
            ...(systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '' && {
                systemInstruction: {
                    // Gemini API expects systemInstruction to be an object with a 'parts' array
                    parts: [{ text: systemPromptText.trim() }]
                }
             })
        };
        const model = genAI.getGenerativeModel(modelOptions);

        const historyForStartChat = chatHistory.slice(0, -1) 
            .map(msg => ({
                 role: msg.role, 
                 parts: Array.isArray(msg.parts) ? msg.parts.map(part => ({ text: part.text || '' })) : [{text: ''}] 
            }))
            .filter(msg => msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

        const chat = model.startChat({
            history: historyForStartChat,
        });

        let lastUserMessageParts = chatHistory[chatHistory.length - 1]?.parts;
        if (!Array.isArray(lastUserMessageParts) || lastUserMessageParts.length === 0 || typeof lastUserMessageParts[0].text !== 'string') {
            console.error("Invalid last user message structure:", chatHistory[chatHistory.length - 1]);
            throw new Error("Internal error: Last user message for API call is malformed.");
        }
        let lastUserMessageText = lastUserMessageParts[0].text;


        console.log(`Sending message to Gemini. History sent to startChat: ${historyForStartChat.length}. System Prompt: ${!!modelOptions.systemInstruction}. Max Output Tokens: ${effectiveMaxOutputTokens}`);
        // console.log("Last User Message Text Sent to Gemini (first 200 chars):", lastUserMessageText.substring(0, 200) + "...");

        const result = await chat.sendMessage(lastUserMessageText);
        const response = result.response;
        const candidate = response?.candidates?.[0];

        if (candidate && (candidate.finishReason === 'STOP' || candidate.finishReason === 'MAX_TOKENS')) {
            const responseText = candidate?.content?.parts?.[0]?.text;
            if (typeof responseText === 'string') {
                if (candidate.finishReason === 'MAX_TOKENS') {
                    console.warn("Gemini response was truncated due to MAX_TOKENS limit.");
                }
                return responseText;
            } else {
                 console.warn("Gemini response finished normally but text content is missing or invalid.", { finishReason: candidate?.finishReason, content: candidate?.content });
                 throw new Error("Received an empty or invalid response from the AI service.");
            }
        } else {
             const finishReason = candidate?.finishReason || 'Unknown';
             const safetyRatings = candidate?.safetyRatings;
             console.warn("Gemini response was potentially blocked or had issues.", { finishReason, safetyRatings });
             let blockMessage = `AI response generation failed or was blocked.`;
             if (finishReason === 'SAFETY') {
                 blockMessage += ` Reason: SAFETY.`;
                 if (safetyRatings) {
                    const blockedCategories = safetyRatings.filter(r => r.blocked).map(r => r.category).join(', ');
                    if (blockedCategories) blockMessage += ` Blocked Categories: ${blockedCategories}.`;
                 }
             } else if (finishReason) {
                 blockMessage += ` Reason: ${finishReason}.`;
             }
             const error = new Error(blockMessage);
             error.status = 400; 
             throw error;
        }
    } catch (error) {
        console.error("Gemini API Call Error:", error?.message || error);
        let clientMessage = "Failed to get response from AI service.";
        if (error.message?.includes("API key not valid")) clientMessage = "AI Service Error: Invalid API Key.";
        else if (error.message?.includes("blocked due to safety")) clientMessage = "AI response blocked due to safety settings.";
        else if (error.message?.includes("Invalid JSON payload")) clientMessage = "AI Service Error: Invalid request format sent to AI.";
        else if (error.message?.includes("User location is not supported")) clientMessage = "AI Service Error: User location is not supported for this model.";
        else if (error.status === 400) clientMessage = `AI Service Error: ${error.message}`; 
        
        const enhancedError = new Error(clientMessage);
        enhancedError.status = error.status || 500; 
        enhancedError.originalError = error; 
        throw enhancedError;
    }
};

module.exports = {
    generateContentWithHistory,
    DEFAULT_MAX_OUTPUT_TOKENS_KG 
};