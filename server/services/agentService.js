// server/services/agentService.js
const { CHAT_MAIN_SYSTEM_PROMPT, createSynthesizerPrompt, createAgenticSystemPrompt } = require('../config/promptTemplates.js');
const { availableTools } = require('./toolRegistry.js');
const { createModelContext, createAgenticContext } = require('../protocols/contextProtocols.js');
const geminiService = require('./geminiService.js');
const ollamaService = require('./ollamaService.js');
const User = require('../models/User');
const { decrypt } = require('../utils/crypto');

function parseToolCall(responseText) {
    try {
        const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[2] : responseText;
        const jsonResponse = JSON.parse(jsonString);
        if (jsonResponse && typeof jsonResponse.tool_call !== 'undefined') {
            return jsonResponse.tool_call;
        }
        return null;
    } catch (e) {
        console.warn(`[AgentService] Failed to parse JSON tool_call from LLM. Response: ${responseText.substring(0, 200)}...`);
        return null;
    }
}

async function processAgenticRequest(userQuery, chatHistory, clientSystemPrompt, requestContext) {
    const { llmProvider, ollamaModel, userId, ollamaUrl, isAcademicSearchEnabled, documentContextName, criticalThinkingEnabled, filter, isWebSearchEnabled, apiKey } = requestContext;
    
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;
    const llmOptions = {
        ...(llmProvider === 'ollama' && { model: ollamaModel }),
        apiKey: apiKey,
        ollamaUrl: ollamaUrl
    };

    const modelContext = createModelContext({ availableTools });
    const agenticContext = createAgenticContext({ systemPrompt: clientSystemPrompt });
    const routerSystemPrompt = createAgenticSystemPrompt(modelContext, agenticContext, { userQuery, ...requestContext });

    console.log(`[AgentService] Performing Router call using ${llmProvider}...`);
    const routerResponseText = await llmService.generateContentWithHistory([], "Analyze the query and decide on an action.", routerSystemPrompt, llmOptions);
    const toolCall = parseToolCall(routerResponseText);

    // --- DIRECT ANSWER PATH (MODIFIED) ---
    if (!toolCall || !toolCall.tool_name) {
        console.log('[AgentService] Decision: Direct Answer. Using main prompt engine.');
        // Build the full, robust system prompt by combining the user's persona with core instructions.
        const finalSystemPrompt = CHAT_MAIN_SYSTEM_PROMPT(clientSystemPrompt);
        
        const directAnswer = await llmService.generateContentWithHistory(
            chatHistory,
            userQuery, // The user's query is the prompt for a direct answer.
            finalSystemPrompt,
            llmOptions
        );
        return {
            finalAnswer: directAnswer,
            references: [],
            sourcePipeline: `${llmProvider}-agent-direct`,
        };
    }

    // --- TOOL-BASED ANSWER PATH ---
    console.log(`[AgentService] Decision: Tool Call -> ${toolCall.tool_name}`);
    const mainTool = availableTools[toolCall.tool_name];
    if (!mainTool) {
        return { finalAnswer: "I tried to use a tool that doesn't exist. Please try again.", references: [], sourcePipeline: 'agent-error-unknown-tool' };
    }

    try {
        const toolExecutionPromises = [mainTool.execute(toolCall.parameters, requestContext)];
        const executedToolNames = [toolCall.tool_name];
        let pipeline = `${llmProvider}-agent-${toolCall.tool_name}`;

        if (toolCall.tool_name === 'rag_search' && criticalThinkingEnabled) {
            console.log('[AgentService] Critical Thinking enabled. Adding KG search to tool execution.');
            const kgTool = availableTools['kg_search'];
            toolExecutionPromises.push(kgTool.execute(toolCall.parameters, { ...requestContext, userId }));
            executedToolNames.push('kg_search');
            pipeline += '+kg';
        }

        const toolResults = await Promise.all(toolExecutionPromises);
        const combinedToolOutput = toolResults.map((result, index) => `--- TOOL OUTPUT: ${executedToolNames[index].toUpperCase()} ---\n${result.toolOutput}`).join('\n\n');
        const combinedReferences = toolResults.flatMap(result => result.references || []);

        console.log(`[AgentService] Performing Synthesizer call using ${llmProvider}...`);
        
        // Build the two main components for the final LLM call
        const finalSystemPrompt = CHAT_MAIN_SYSTEM_PROMPT(clientSystemPrompt);
        const synthesizerUserQuery = createSynthesizerPrompt(userQuery, combinedToolOutput, toolCall.tool_name);
        
        const finalAnswer = await llmService.generateContentWithHistory(chatHistory, synthesizerUserQuery, finalSystemPrompt, llmOptions);
        
        return {
            finalAnswer,
            references: combinedReferences,
            sourcePipeline: pipeline,
        };
    } catch (error) {
        console.error(`[AgentService] Error executing tool '${toolCall.tool_name}':`, error);
        return { finalAnswer: `I tried to use a tool, but it failed. Error: ${error.message}.`, references: [], sourcePipeline: `agent-error-tool-failed` };
    }
}

module.exports = {
    processAgenticRequest,
};