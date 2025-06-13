// server/services/agentService.js
const { createAgenticSystemPrompt, createSynthesizerPrompt } = require('../config/promptTemplates.js');
const { availableTools } = require('./toolRegistry.js');
const { createModelContext, createAgenticContext } = require('../protocols/contextProtocols.js');
const geminiService = require('./geminiService.js');
const ollamaService = require('./ollamaService.js');

function parseToolCall(responseText) {
    const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[2] : responseText;
    try {
        const jsonResponse = JSON.parse(jsonString);
        if (jsonResponse && jsonResponse.tool_call) {
            return jsonResponse.tool_call;
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function processAgenticRequest(userQuery, chatHistory, systemPrompt, requestContext) {
    const { llmProvider, ollamaModel } = requestContext;

    const modelContext = createModelContext({ availableTools });
    const agenticContext = createAgenticContext({ systemPrompt });
    const agenticSystemPrompt = createAgenticSystemPrompt(modelContext, agenticContext, requestContext);

    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;
    const llmOptions = llmProvider === 'ollama' ? { model: ollamaModel } : {};

    console.log(`[AgentService] Performing Router call using ${llmProvider}...`);
    const routerResponseText = await llmService.generateContentWithHistory(
        chatHistory, userQuery, agenticSystemPrompt, llmOptions
    );

    const toolCall = parseToolCall(routerResponseText);

    if (!toolCall) {
        console.log('[AgentService] Decision: Direct Answer.');
        return {
            finalAnswer: routerResponseText,
            references: [],
            sourcePipeline: `${llmProvider}-agent-direct`,
        };
    }

    console.log(`[AgentService] Decision: Tool Call -> ${toolCall.tool_name}`);
    const tool = availableTools[toolCall.tool_name];
    if (!tool) {
        console.error(`[AgentService] LLM tried to call an unknown tool: ${toolCall.tool_name}`);
        return { finalAnswer: "I tried to use a tool, but made a mistake. Please rephrase your request.", references: [], sourcePipeline: 'agent-error-unknown-tool' };
    }

    try {
        // --- FIX: Pass the LLM parameters AND the full request context to the tool ---
        const toolResult = await tool.execute(toolCall.parameters, requestContext);
        // --- END FIX ---

        console.log(`[AgentService] Performing Synthesizer call using ${llmProvider}...`);
        const synthesizerPrompt = createSynthesizerPrompt(userQuery, toolResult.toolOutput);
        const finalAnswer = await llmService.generateContentWithHistory(
            chatHistory, synthesizerPrompt, systemPrompt, llmOptions
        );
        
        return {
            finalAnswer,
            references: toolResult.references || [],
            sourcePipeline: `${llmProvider}-agent-${toolCall.tool_name}`,
        };
    } catch (error) {
        console.error(`[AgentService] Error executing tool '${toolCall.tool_name}':`, error);
        return { finalAnswer: `I tried to use a tool, but it failed. Error: ${error.message}.`, references: [], sourcePipeline: `agent-error-tool-failed` };
    }
}

module.exports = {
    processAgenticRequest,
};