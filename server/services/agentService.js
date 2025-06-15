// server/services/agentService.js
const { createAgenticSystemPrompt, createSynthesizerPrompt } = require('../config/promptTemplates.js');
const { availableTools } = require('./toolRegistry.js');
const { createModelContext, createAgenticContext } = require('../protocols/contextProtocols.js');
const geminiService = require('../services/geminiService.js');
const ollamaService = require('../services/ollamaService.js');
const User = require('../models/User');
const { decrypt } = require('../utils/crypto');

function parseToolCall(responseText) {
    const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[2] : responseText;
    try {
        const jsonResponse = JSON.parse(jsonString);
        return jsonResponse.tool_call || null;
    } catch (e) {
        return null;
    }
}

async function processAgenticRequest(userQuery, chatHistory, systemPrompt, requestContext) {
    const { llmProvider, ollamaModel, userId } = requestContext;

    // Fetch user to get their encrypted API key
    const user = await User.findById(userId).select('+encryptedApiKey');
    if (!user) {
        throw new Error("User not found during agent processing.");
    }

    // Decrypt the key once for use in this request
    const userApiKey = decrypt(user.encryptedApiKey);
    if (llmProvider === 'gemini' && !userApiKey) {
        throw { status: 400, message: "User's Gemini API key is missing or could not be decrypted. Please update it in your profile settings." };
    }

    const modelContext = createModelContext({ availableTools });
    const agenticContext = createAgenticContext({ systemPrompt });
    const agenticSystemPrompt = createAgenticSystemPrompt(modelContext, agenticContext, requestContext);

    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;
    
    // Create the options object ONCE with the user's key and use it for all calls.
    const llmOptions = {
        ...(llmProvider === 'ollama' && { model: ollamaModel }),
        apiKey: userApiKey,
    };

    console.log(`[AgentService] Performing Router call using ${llmProvider}...`);
    // Pass the llmOptions with the key to the Router call
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
        return { finalAnswer: "I tried to use a tool, but made a mistake.", references: [], sourcePipeline: 'agent-error-unknown-tool' };
    }

    try {
        let toolPromises = [mainTool.execute(toolCall.parameters, requestContext)];
        let pipeline = `${llmProvider}-agent-${toolCall.tool_name}`;

        if (toolCall.tool_name === 'rag_search' && requestContext.criticalThinkingEnabled) {
            console.log('[AgentService] Critical Thinking enabled. Adding KG search to tool execution.');
            const kgTool = availableTools['kg_search'];
            toolPromises.push(kgTool.execute(toolCall.parameters, requestContext));
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
        
        // Pass the same llmOptions with the key to the Synthesizer call
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