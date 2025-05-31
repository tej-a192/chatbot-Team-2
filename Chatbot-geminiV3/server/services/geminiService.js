// server/services/geminiService.js
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = "gemini-1.5-flash"; 

if (!API_KEY) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not available in the environment. Server should have exited.");
    throw new Error("GEMINI_API_KEY is missing.");
}

const genAI = new GoogleGenerativeAI(API_KEY);

const baseGenerationConfig = {
    temperature: 0.7, 
    maxOutputTokens: 4096, 
};

const baseSafetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

const generateContentWithHistory = async (chatHistory, systemPromptText = null /* relevantDocs not used directly here */) => {
    try {
        if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
             throw new Error("Chat history must be a non-empty array.");
        }
        if (chatHistory[chatHistory.length - 1].role !== 'user') {
            console.error("History for Gemini API must end with a 'user' role message. Last role:", chatHistory[chatHistory.length - 1].role);
            throw new Error("Internal error: Invalid chat history sequence for API call.");
        }

        const modelOptions = {
            model: MODEL_NAME,
            generationConfig: baseGenerationConfig,
            safetySettings: baseSafetySettings,
            ...(systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '' && {
                systemInstruction: {
                    parts: [{ text: systemPromptText.trim() }]
                }
             })
        };
        const model = genAI.getGenerativeModel(modelOptions);

        const historyForStartChat = chatHistory.slice(0, -1)
            .map(msg => ({ 
                 role: msg.role,
                 parts: msg.parts.map(part => ({ text: part.text || '' }))
            }))
            .filter(msg => msg.role && msg.parts && msg.parts.length > 0 && typeof msg.parts[0].text === 'string');

        const chat = model.startChat({
            history: historyForStartChat,
        });

        let lastUserMessageText = chatHistory[chatHistory.length - 1].parts[0].text;

        console.log(`Sending message to Gemini. History length sent to startChat: ${historyForStartChat.length}. System Prompt Used: ${!!modelOptions.systemInstruction}`);
        // console.log("Last User Message Text Sent to Gemini (first 200 chars):", lastUserMessageText.substring(0, 200) + "...");

        const result = await chat.sendMessage(lastUserMessageText);
        const response = result.response;
        const candidate = response?.candidates?.[0];

        if (candidate && (candidate.finishReason === 'STOP' || candidate.finishReason === 'MAX_TOKENS')) {
            const responseText = candidate?.content?.parts?.[0]?.text;
            if (typeof responseText === 'string') {
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
             if (finishReason) blockMessage += ` Reason: ${finishReason}.`;
             if (safetyRatings) {
                const blockedCategories = safetyRatings.filter(r => r.blocked).map(r => r.category).join(', ');
                if (blockedCategories) blockMessage += ` Blocked Categories: ${blockedCategories}.`;
             }
             const error = new Error(blockMessage);
             error.status = 400; 
             throw error;
        }
    } catch (error) {
        console.error("Gemini API Call Error:", error?.message || error);
        let clientMessage = "Failed to get response from AI service.";
        if (error.message?.includes("API key not valid")) clientMessage = "AI Service Error: Invalid API Key.";
        else if (error.message?.includes("blocked")) clientMessage = error.message;
        else if (error.status === 400) clientMessage = `AI Service Error: ${error.message}`;
        
        const enhancedError = new Error(clientMessage);
        enhancedError.status = error.status || 500; 
        enhancedError.originalError = error; 
        throw enhancedError;
    }
};

module.exports = { generateContentWithHistory };