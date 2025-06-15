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
    const { llmProvider, ollamaModel, criticalThinkingEnabled, documentContextName, userId } = requestContext;

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
    const mainTool = availableTools[toolCall.tool_name];
    if (!mainTool) {
        console.error(`[AgentService] LLM tried to call an unknown tool: ${toolCall.tool_name}`);
        return { finalAnswer: "I tried to use a tool, but made a mistake. Please rephrase your request.", references: [], sourcePipeline: 'agent-error-unknown-tool' };
    }

    try {
        let toolPromises = [mainTool.execute(toolCall.parameters, requestContext)];
        let pipeline = `${llmProvider}-agent-${toolCall.tool_name}`;

        // --- NEW LOGIC: If RAG search and Critical Thinking are on, also call KG search ---
        if (toolCall.tool_name === 'rag_search' && criticalThinkingEnabled) {
            console.log('[AgentService] Critical Thinking enabled. Adding KG search to tool execution.');
            const kgTool = availableTools['kg_search'];
            // Pass the user's ID from the request context for the KG query
            toolPromises.push(kgTool.execute(toolCall.parameters, { ...requestContext, userId }));
            pipeline += '+kg';
        }

        const toolResults = await Promise.all(toolPromises);
        
        const combinedToolOutput = toolResults.map((result, index) => {
            const toolName = index === 0 ? toolCall.tool_name : 'kg_search';
            return `--- TOOL OUTPUT: ${toolName.toUpperCase()} ---\n${result.toolOutput}`;
        }).join('\n\n');
        
        const combinedReferences = toolResults.flatMap(result => result.references || []);

        console.log(`[AgentService] Performing Synthesizer call using ${llmProvider}...`);
        const synthesizerPrompt = createSynthesizerPrompt(userQuery, combinedToolOutput);
        const finalAnswer = await llmService.generateContentWithHistory(
            chatHistory, synthesizerPrompt, systemPrompt, llmOptions
        );
        
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