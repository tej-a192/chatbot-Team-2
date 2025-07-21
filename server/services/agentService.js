// server/services/agentService.js
const { CHAT_MAIN_SYSTEM_PROMPT, createSynthesizerPrompt, createAgenticSystemPrompt } = require('../config/promptTemplates.js');
const { availableTools } = require('./toolRegistry.js');
const { createModelContext, createAgenticContext } = require('../protocols/contextProtocols.js');
const geminiService = require('./geminiService.js');
const ollamaService = require('./ollamaService.js');

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
    const { llmProvider, ollamaModel, userId, ollamaUrl, documentContextName, apiKey } = requestContext;
    
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

    // --- DIRECT ANSWER PATH (Corrected Logic) ---
    if (!toolCall || !toolCall.tool_name) {
        console.log('[AgentService] Decision: Direct Answer. Using main prompt engine.');
        // This now correctly combines your base instructions with the user's selected persona.
        const finalSystemPrompt = CHAT_MAIN_SYSTEM_PROMPT();
        const fullUserQuery = `${clientSystemPrompt}\n\nUSER QUERY:\n${userQuery}`;
        
        const directAnswer = await llmService.generateContentWithHistory(
            chatHistory,
            fullUserQuery,
            finalSystemPrompt,
            llmOptions
        );

        // Extract thinking if present
        const thinkingMatch = directAnswer.match(/<thinking>([\s\S]*?)<\/thinking>/i);
        const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;
        const mainContent = thinking ? directAnswer.replace(/<thinking>[\s\S]*?<\/thinking>\s*/i, '').trim() : directAnswer;

        return {
            finalAnswer: mainContent,
            thinking: thinking,
            references: [],
            sourcePipeline: `${llmProvider}-agent-direct`,
        };
    }

    // --- TOOL-BASED ANSWER PATH (With KG Enhancement) ---
    console.log(`[AgentService] Decision: Tool Call -> ${toolCall.tool_name}`);
    const mainTool = availableTools[toolCall.tool_name];
    if (!mainTool) {
        return { finalAnswer: "I tried to use a tool that doesn't exist. Please try again.", references: [], sourcePipeline: 'agent-error-unknown-tool' };
    }

    try {
        const toolExecutionPromises = [mainTool.execute(toolCall.parameters, requestContext)];
        const executedToolNames = [toolCall.tool_name];
        let pipeline = `${llmProvider}-agent-${toolCall.tool_name}`;

        // If the main tool is RAG and a document is selected, automatically add KG search.
        if (toolCall.tool_name === 'rag_search' && documentContextName) {
            console.log('[AgentService] RAG search triggered. Automatically adding KG search to execution plan.');
            const kgTool = availableTools['kg_search'];
            toolExecutionPromises.push(kgTool.execute(toolCall.parameters, { ...requestContext, userId }));
            executedToolNames.push('kg_search');
            pipeline += '+kg';
        }

        const toolResults = await Promise.all(toolExecutionPromises);
        
        const combinedToolOutput = toolResults.map((result, index) => 
            `--- CONTEXT FROM: ${executedToolNames[index].toUpperCase()} ---\n${result.toolOutput}`
        ).join('\n\n');
        const combinedReferences = toolResults.flatMap(result => result.references || []);

        console.log(`[AgentService] Performing Synthesizer call using ${llmProvider}...`);
        
        const finalSystemPrompt = CHAT_MAIN_SYSTEM_PROMPT();
        const synthesizerUserQuery = createSynthesizerPrompt(userQuery, combinedToolOutput, toolCall.tool_name);
        
        const finalAnswerWithThinking = await llmService.generateContentWithHistory(chatHistory, synthesizerUserQuery, finalSystemPrompt, llmOptions);
        
        // Extract thinking from synthesizer response
        const thinkingMatch = finalAnswerWithThinking.match(/<thinking>([\s\S]*?)<\/thinking>/i);
        const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;
        const finalAnswer = thinking ? finalAnswerWithThinking.replace(/<thinking>[\s\S]*?<\/thinking>\s*/i, '').trim() : finalAnswerWithThinking;

        return {
            finalAnswer,
            thinking,
            references: combinedReferences,
            sourcePipeline: pipeline,
        };
    } catch (error) {
        console.error(`[AgentService] Error executing tool '${toolCall.tool_name}':`, error);
        return { finalAnswer: `I tried to use a tool, but it failed. Error: ${error.message}.`, references: [], thinking: null, sourcePipeline: `agent-error-tool-failed` };
    }
}

module.exports = {
    processAgenticRequest,
};