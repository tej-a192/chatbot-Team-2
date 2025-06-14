// server/services/geminiService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-1.5-flash";

if (!API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not available in the environment. Server should have exited.");
    throw new Error("GEMINI_API_KEY is missing.");
}

const genAI = new GoogleGenerativeAI(API_KEY);

const DEFAULT_MAX_OUTPUT_TOKENS_CHAT = 8192;
const DEFAULT_MAX_OUTPUT_TOKENS_KG = 65536;

const baseSafetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

async function generateContentWithHistory(
    chatHistory,
    currentUserQuery,
    systemPromptText = null,
    options = {} // Now accepts { maxOutputTokens }
) {
    try {
        if (typeof currentUserQuery !== 'string' || currentUserQuery.trim() === '') {
            throw new Error("currentUserQuery must be a non-empty string.");
        }

        // --- FIX: Correctly construct the generationConfig object ---
        const generationConfig = {
            temperature: 0.7,
            maxOutputTokens: options.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS_CHAT,
        };
        
        const model = genAI.getGenerativeModel({
            model: MODEL_NAME,
            // Pass systemInstruction and safetySettings at the top level
            systemInstruction: {
                parts: [{ text: systemPromptText || "You are a helpful AI assistant." }]
            },
            safetySettings: baseSafetySettings,
        });
        // --- END FIX ---

        const historyForStartChat = (chatHistory || [])
            .map(msg => ({
                role: msg.role,
                parts: Array.isArray(msg.parts) ? msg.parts.map(part => ({ text: part.text || '' })) : [{ text: '' }]
            }))
            .filter(msg => msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

        const chat = model.startChat({
            history: historyForStartChat,
            // Pass the generationConfig here, when starting the chat session
            generationConfig: generationConfig,
        });

        console.log(`Sending message to Gemini. History sent: ${historyForStartChat.length}. Max Output Tokens: ${generationConfig.maxOutputTokens}`);
        console.log(`Current User Query to sendMessage: "${currentUserQuery.substring(0, 100)}..."`);

        const result = await chat.sendMessage(currentUserQuery);
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
        let clientMessage = `AI Service Error: ${error.message}`;

        // Keep specific error messages
        if (error.message?.includes("API key not valid")) clientMessage = "AI Service Error: Invalid API Key.";
        else if (error.message?.includes("User location is not supported")) clientMessage = "AI Service Error: User location is not supported for this model.";
        
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