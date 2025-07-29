// server/services/totOrchestrator.js

const { processAgenticRequest } = require('./agentService');
const geminiService = require('./geminiService');
const ollamaService = require('./ollamaService');
const { PLANNER_PROMPT_TEMPLATE, EVALUATOR_PROMPT_TEMPLATE, createSynthesizerPrompt } = require('../config/promptTemplates');

async function isQueryComplex(query) {
    const isComplex = (query.match(/\?/g) || []).length > 1 || query.split(' ').length > 20;
    console.log(`[ToT] Step 1: Complexity Gate. Query: "${query.substring(0, 30)}...". Decision: ${isComplex ? 'COMPLEX' : 'SIMPLE'}`);
    return isComplex;
}

async function generatePlans(query, requestContext) {
    console.log('[ToT] Step 2: Planner. Generating plans via LLM...');
    const { llmProvider, ...llmOptions } = requestContext;
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;

    const plannerPrompt = PLANNER_PROMPT_TEMPLATE.replace("{userQuery}", query);

    try {
        const responseText = await llmService.generateContentWithHistory(
            [], plannerPrompt, "You are a planning agent.", llmOptions
        );
        const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[2] : responseText;
        const parsedResponse = JSON.parse(jsonString);

        if (parsedResponse.plans && Array.isArray(parsedResponse.plans) && parsedResponse.plans.length > 0) {
            parsedResponse.plans.forEach(plan => {
                if (plan.steps && Array.isArray(plan.steps)) {
                    plan.steps = plan.steps.map(step => (typeof step === 'object') ? JSON.stringify(step) : String(step));
                }
            });
            console.log(`[ToT] Planner: Successfully generated and validated ${parsedResponse.plans.length} plans.`);
            return parsedResponse.plans;
        }
    } catch (error) {
        console.error(`[ToT] Planner: LLM call failed or returned invalid JSON. Error: ${error.message}. Falling back to default plan.`);
    }

    return [{
        name: "Default Direct Search Plan",
        steps: [`Directly address the user's query: "${query}"`]
    }];
}

async function evaluatePlans(plans, query, requestContext) {
    console.log('[ToT] Step 3: Evaluator. Evaluating plans via LLM...');
    if (!plans || plans.length === 0) throw new Error("No plans provided to evaluate.");
    if (plans.length === 1) {
        console.log('[ToT] Evaluator: Only one plan available. Selecting it by default.');
        return plans[0];
    }

    const { llmProvider, ...llmOptions } = requestContext;
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;
    const plansJsonString = JSON.stringify(plans, null, 2);

    const evaluatorPrompt = EVALUATOR_PROMPT_TEMPLATE.replace("{userQuery}", query).replace("{plansJsonString}", plansJsonString);

    try {
        const responseText = await llmService.generateContentWithHistory(
            [], evaluatorPrompt, "You are an evaluating agent.", llmOptions
        );
        const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[2] : responseText;
        const parsedResponse = JSON.parse(jsonString);

        if (parsedResponse.best_plan_name) {
            const winningPlan = plans.find(p => p.name === parsedResponse.best_plan_name);
            if (winningPlan) {
                console.log(`[ToT] Evaluator: LLM selected winning plan: "${winningPlan.name}"`);
                return winningPlan;
            }
        }
    } catch (error) {
        console.error(`[ToT] Evaluator: LLM call failed or returned invalid JSON. Error: ${error.message}. Falling back to first plan.`);
    }
    
    console.log(`[ToT] Evaluator: Fallback selected. Winning plan: "${plans[0].name}"`);
    return plans[0];
}


async function executePlan(winningPlan, originalQuery, requestContext, streamCallback) {
    console.log('[ToT] Step 4: Executor. Starting execution of plan...');
    let collectedContexts = [];
    let collectedReferences = [];
    let cumulativeContext = ""; 

    for (let i = 0; i < winningPlan.steps.length; i++) {
        const stepDescription = winningPlan.steps[i];
        
        const systemPromptForStep = `You are one step in a multi-step reasoning plan.
Original User Query: "${originalQuery}"

--- PREVIOUS CONTEXT (Memory from prior steps) ---
${cumulativeContext || "This is the first step, so there is no previous context."}
--- END PREVIOUS CONTEXT ---

Your Specific Sub-Task for THIS step is: "${stepDescription}"

Use the PREVIOUS CONTEXT if it's relevant to complete your sub-task.
`;

        const agentResponse = await processAgenticRequest(
            stepDescription,     
            [],                
            systemPromptForStep,
            requestContext
        );

        const monologue = agentResponse.thinking || `The step was executed, but no detailed thinking was provided.`;
        const thoughtContent = `**Step ${i + 1}/${winningPlan.steps.length}: ${stepDescription}**\n*Thinking:* ${monologue}\n\n`;
        streamCallback({ type: 'thought', content: thoughtContent });
        
        console.log(`[ToT] Executor: Step ${i+1} completed.`);
        
        const stepResult = `--- Context from Step ${i + 1} (${agentResponse.sourcePipeline}) ---\n${agentResponse.finalAnswer}`;
        collectedContexts.push(stepResult);

        cumulativeContext += stepResult + "\n\n";

        if (agentResponse.references && agentResponse.references.length > 0) {
            collectedReferences.push(...agentResponse.references);
        }
    }

    console.log(`[ToT] Step 4: Executor. All steps executed. Collected ${collectedReferences.length} references.`);
    return {
        finalContext: collectedContexts.join('\n\n'),
        allReferences: collectedReferences
    };
}

async function synthesizeFinalAnswer(originalQuery, finalContext, chatHistory, requestContext) {
    console.log('[ToT] Step 5: Synthesizer. Creating final response...');
    const { llmProvider, ...llmOptions } = requestContext;
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;

    const synthesizerUserQuery = createSynthesizerPrompt(
        originalQuery, finalContext, 'tree_of_thought_synthesis'
    );

    const finalAnswer = await llmService.generateContentWithHistory(
        chatHistory, synthesizerUserQuery, requestContext.systemPrompt, llmOptions
    );
    return finalAnswer;
}

async function processQueryWithToT_Streaming(query, chatHistory, requestContext, streamCallback) {
    const allThoughts = [];
    const streamAndStoreThought = (content) => {
        streamCallback({ type: 'thought', content });
        allThoughts.push(content);
    };

    const isComplex = await isQueryComplex(query);

    if (!isComplex) {
        // Step 1: Stream the initial classification thought. This gives immediate feedback.
        streamAndStoreThought(`**Analyzing Query**\nQuery classified as straightforward. Bypassing complex planning to generate a direct response.\n\n`);
        
        // Step 2: Get the direct response. This now includes the LLM's own thinking process.
        const directResponse = await processAgenticRequest(
            query,
            chatHistory,
            requestContext.systemPrompt,
            { ...requestContext, forceSimple: true }
        );

        // Step 3: Check for and stream the detailed thinking from the direct answer.
        if (directResponse.thinking) {
            // This is the new, crucial part. We stream the thinking we just received.
            const thinkingHeader = `**Direct Response Plan**\n`;
            streamAndStoreThought(thinkingHeader + directResponse.thinking);
        }

        // Step 4: The final object is now built from all thoughts that were streamed.
        const finalThoughts = allThoughts.join(''); // Join without extra separators, as they are in the content.

        return { 
            finalAnswer: directResponse.finalAnswer, 
            thoughts: finalThoughts, 
            references: directResponse.references, 
            sourcePipeline: directResponse.sourcePipeline 
        };
    }


    streamAndStoreThought("**Starting Complex Reasoning**\nQuery detected as complex. Initiating multi-step Tree of Thought process.\n\n");
    
    const plans = await generatePlans(query, requestContext);
    streamAndStoreThought(`**Planning Stage**\nGenerated ${plans.length} potential plans. Now evaluating the best approach.\n\n`);
    
    const winningPlan = await evaluatePlans(plans, query, requestContext);
    streamAndStoreThought(`**Evaluation Stage**\nBest plan selected: "${winningPlan.name}". Beginning execution.\n\n`);

    const { finalContext, allReferences } = await executePlan(winningPlan, query, requestContext, streamCallback);
    
    streamAndStoreThought("**Synthesizing Final Answer**\nAll information has been gathered. Compiling the final, comprehensive response.\n\n");

    const finalAnswerWithThinking = await synthesizeFinalAnswer(query, finalContext, chatHistory, requestContext);

    const thinkingMatch = finalAnswerWithThinking.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    const thinking = thinkingMatch ? thinkingMatch[1].trim() : null;
    const finalAnswer = thinking ? finalAnswerWithThinking.replace(/<thinking>[\s\S]*?<\/thinking>\s*/i, '').trim() : finalAnswerWithThinking;

    allThoughts.push(thinking);
    const finalThoughts = allThoughts.filter(Boolean).join('');
    
    console.log('--- ToT Streaming Orchestration Finished ---');
    return {
        finalAnswer,
        thoughts: finalThoughts,
        references: allReferences,
        sourcePipeline: `tot-${requestContext.llmProvider}`
    };
}

module.exports = {
    processQueryWithToT_Streaming
};