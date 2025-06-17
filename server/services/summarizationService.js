// server/services/summarizationService.js
const geminiService = require('./geminiService');
const ollamaService = require('./ollamaService');

// This prompt is key. It instructs the LLM on how to create a good, cumulative summary.
const SUMMARIZATION_SYSTEM_PROMPT = `You are an expert conversation summarizer. Your task is to create a concise, yet comprehensive summary of the provided chat history between a User and an AI Assistant.

If an "Existing Summary" is provided, you MUST integrate the "New Messages" into it to create a single, updated, and coherent summary. Do not just append the new information; seamlessly weave it into the existing narrative.

The final summary MUST be in the third person.
Focus on capturing:
- The user's primary goals or questions.
- Key facts, concepts, or entities discussed.
- Important conclusions or resolutions reached.
- Any unresolved questions or next steps mentioned by the user.

Do NOT include conversational filler (e.g., "The user said hello"). The output should be a dense, information-rich paragraph.

Example of a good updated summary:
"Previously, the user, a PhD student, asked about 'Separation of Concerns'. In the latest exchange, they pivoted to inquiring about the specifics of Ohm's Law, and the AI provided the formula V=IR based on a document the user supplied. The user's current goal appears to be understanding foundational engineering concepts, moving from software to electrical principles."
`;

/**
 * Creates or updates a conversation summary.
 * @param {Array<Object>} messagesToSummarize - The array of new message objects to add to the summary.
 * @param {string} existingSummary - The existing summary from the database.
 * @param {string} llmProvider - The LLM provider to use ('gemini' or 'ollama').
 * @param {string} ollamaModel - The specific Ollama model if the provider is 'ollama'.
 * @returns {Promise<string>} The generated summary text.
 */
async function createOrUpdateSummary(messagesToSummarize, existingSummary, llmProvider, ollamaModel, userApiKey) { // <<< ADD userApiKey here
    if (!messagesToSummarize || messagesToSummarize.length === 0) {
        return existingSummary || "";
    }

    const newMessagesText = messagesToSummarize.map(msg => {
        const role = msg.role === 'model' ? 'Assistant' : 'User';
        const text = msg.parts?.[0]?.text || '';
        return `${role}: ${text}`;
    }).join('\n\n');

    let userPrompt = "";
    if (existingSummary && existingSummary.trim() !== "") {
        userPrompt = `Existing Summary:\n"""\n${existingSummary}\n"""\n\nNew Messages to integrate:\n"""\n${newMessagesText}\n"""\n\nPlease provide the new, updated summary.`;
    } else {
        userPrompt = `New Messages to summarize:\n"""\n${newMessagesText}\n"""\n\nPlease provide the summary.`;
    }

    const historyForLlm = [{ role: 'user', parts: [{ text: userPrompt }] }];

    console.log(`[SummarizationService] Requesting summary using ${llmProvider}.`);

    try {
        let summary;
        // --- THIS IS THE FIX ---
        const llmOptions = { 
            apiKey: userApiKey, // Pass the key in the options object
        };
        if (llmProvider === 'ollama') {
            summary = await ollamaService.generateContentWithHistory(
                historyForLlm,
                SUMMARIZATION_SYSTEM_PROMPT,
                { ...llmOptions, model: ollamaModel, maxOutputTokens: 2048 }
            );
        } else { // Default to Gemini
            summary = await geminiService.generateContentWithHistory(
                historyForLlm,
                SUMMARIZATION_SYSTEM_PROMPT,
                null, // systemPromptText is in the user prompt for this service
                llmOptions // Pass the options object containing the user's key
            );
        }
        // --- END OF FIX ---

        console.log(`[SummarizationService] Summary generated successfully.`);
        return summary.trim();
    } catch (error) {
        console.error(`[SummarizationService] Error generating summary: ${error.message}`);
        return existingSummary || "";
    }
}


module.exports = { createOrUpdateSummary };