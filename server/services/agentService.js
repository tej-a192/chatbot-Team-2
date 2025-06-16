// server/services/agentService.js
const { createAgenticSystemPrompt, createSynthesizerPrompt } = require('../config/promptTemplates.js');
const { availableTools } = require('./toolRegistry.js');
const { createModelContext, createAgenticContext } = require('../protocols/contextProtocols.js');
const geminiService = require('./geminiService.js');
const ollamaService = require('./ollamaService.js');
const User = require('../models/User');
const { decrypt } = require('../utils/crypto');

function parseToolCall(responseText) {
    const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[2] : responseText;
    try {
        const jsonResponse = JSON.parse(jsonString);
        // Check that the key 'tool_call' exists in the object.
        // It can be an object or null, but it must be present.
        if (jsonResponse && typeof jsonResponse.tool_call !== 'undefined') {
            return jsonResponse.tool_call;
        }
        return null;
    } catch (e) {
        console.warn(`[AgentService] Failed to parse JSON from LLM response: ${e.message}. Response: ${responseText.substring(0, 200)}...`);
        return null;
    }
}

async function processAgenticRequest(userQuery, chatHistory, systemPrompt, requestContext) {
    const { llmProvider, ollamaModel, userId } = requestContext;

    const user = await User.findById(userId).select('+encryptedApiKey');
    if (!user) {
        throw new Error("User not found during agent processing.");
    }
    
    const userApiKey = user.encryptedApiKey ? decrypt(user.encryptedApiKey) : null;
    if (user.encryptedApiKey && !userApiKey) {
        console.warn(`[AgentService] Failed to decrypt API key for user ${userId}. LLM will use server fallback key if configured.`);
    }

    const modelContext = createModelContext({ availableTools });
    const agenticContext = createAgenticContext({ systemPrompt });
    
    const agenticSystemPrompt = createAgenticSystemPrompt(
        modelContext, 
        agenticContext, 
        { ...requestContext, userQuery } 
    );

    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;
    const llmOptions = {
        ...(llmProvider === 'ollama' && { model: ollamaModel }),
        apiKey: userApiKey, 
    };

    const routerResponseText = await llmService.generateContentWithHistory(
        [{ role: 'user', parts: [{ text: "Analyze context and query then return JSON decision."}] }], 
        "Analyze context and query then return JSON decision.", 
        agenticSystemPrompt,
        llmOptions
    );

    const toolCall = parseToolCall(routerResponseText);

    if (!toolCall || !toolCall.tool_name) {
        console.log('[AgentService] Decision: Direct Answer.');
        const directAnswer = await llmService.generateContentWithHistory(
            chatHistory, 
            userQuery,   
            systemPrompt,
            llmOptions
        );
        return {
            finalAnswer: directAnswer, references: [], sourcePipeline: `${llmProvider}-agent-direct`,
        };
    }

    console.log(`[AgentService] Decision: Tool Call -> ${toolCall.tool_name}`);
    const mainTool = availableTools[toolCall.tool_name];
    if (!mainTool) {
        return { finalAnswer: "I tried to use a tool that doesn't exist.", references: [], sourcePipeline: 'agent-error-unknown-tool' };
    }

    try {
        const toolExecutionPromises = [];
        const executedToolNames = [];

        toolExecutionPromises.push(mainTool.execute(toolCall.parameters, requestContext));
        executedToolNames.push(toolCall.tool_name);
        
        let pipeline = `${llmProvider}-agent-${toolCall.tool_name}`;

        if (toolCall.tool_name === 'rag_search' && requestContext.criticalThinkingEnabled) {
            console.log('[AgentService] Critical Thinking enabled. Adding KG search to tool execution.');
            const kgTool = availableTools['kg_search'];
            toolPromises.push(kgTool.execute(toolCall.parameters, { ...requestContext, userId: userId.toString() })); 
            pipeline += '+kg';
        }

        const toolResults = await Promise.all(toolExecutionPromises);
        
        const combinedToolOutput = toolResults.map((result, index) => {
            const toolName = executedToolNames[index];
            return `--- TOOL OUTPUT: ${toolName.toUpperCase()} ---\n${result.toolOutput}`;
        }).join('\n\n');
        
        // --- THIS IS THE FIX ---
        // This correctly flattens the arrays of references from all tool results into one.
        const combinedReferences = toolResults.flatMap(result => result.references || []);
        // --- END OF FIX ---

        console.log(`[AgentService] Performing Synthesizer call using ${llmProvider}...`);
        
        const synthesizerPrompt = createSynthesizerPrompt(userQuery, combinedToolOutput, toolCall.tool_name);
        const finalAnswer = await llmService.generateContentWithHistory(
            chatHistory,         
            synthesizerPrompt,   
            systemPrompt,        
            llmOptions
        );
        
        return {
            finalAnswer,
            references: combinedReferences, // Now this will contain the web search references
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