// server/services/criticalThinkingService.js
const geminiService = require('./geminiService');
const ollamaService = require('./ollamaService');
const { CRITICAL_THINKING_CUE_TEMPLATE } = require('../config/promptTemplates');

const CUE_GEMINI_MODEL = process.env.PROMPT_COACH_GEMINI_MODEL || 'gemini-1.5-flash-latest';
const CUE_OLLAMA_MODEL = process.env.PROMPT_COACH_OLLAMA_MODEL || 'phi3:mini-instruct';

/**
 * Analyzes an AI's final answer to generate critical thinking cue prompts.
 * @param {string} aiAnswerText - The final text of the AI's response.
 * @param {object} llmConfig - Configuration object containing the user's provider, key, URL, etc.
 * @returns {Promise<object|null>} An object with cue prompts, or null if none are generated or an error occurs.
 */
async function generateCues(aiAnswerText, llmConfig) {
    if (!aiAnswerText || aiAnswerText.trim().length < 50) {
        // Don't generate cues for very short or empty answers
        return null;
    }

    const { llmProvider, ollamaUrl, apiKey } = llmConfig;
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;

    const promptForLlm = CRITICAL_THINKING_CUE_TEMPLATE.replace('{aiAnswer}', aiAnswerText.substring(0, 2000)); // Limit context size for speed

    const llmOptions = {
        model: llmProvider === 'ollama' ? CUE_OLLAMA_MODEL : CUE_GEMINI_MODEL,
        apiKey: apiKey,
        ollamaUrl: ollamaUrl,
        temperature: 0.4 // Lower temperature for more deterministic, structured output
    };

    try {
        console.log(`[CriticalThinkingService] Generating cues using ${llmProvider} with model ${llmOptions.model}.`);
        const responseText = await llmService.generateContentWithHistory([], promptForLlm, null, llmOptions);

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn("[CriticalThinkingService] LLM response did not contain a valid JSON object.");
            return null;
        }
        
        const parsedResponse = JSON.parse(jsonMatch[0]);

        // Validate that at least one valid key exists
        if (parsedResponse.verificationPrompt || parsedResponse.alternativePrompt || parsedResponse.applicationPrompt) {
            return parsedResponse;
        }

        // Return null if the object is empty ({})
        return null;

    } catch (error) {
        console.error(`[CriticalThinkingService] Failed to generate cues: ${error.message}`);
        // Return null on any error to ensure this feature doesn't block the main response
        return null;
    }
}

module.exports = {
    generateCues
};