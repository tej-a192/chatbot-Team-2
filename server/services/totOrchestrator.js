// server/services/totOrchestrator.js

const { processAgenticRequest } = require('./agentService');
const geminiService = require('./geminiService');
const ollamaService = require('./ollamaService');
const { PLANNER_PROMPT_TEMPLATE, EVALUATOR_PROMPT_TEMPLATE } = require('../config/promptTemplates');


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
            [],
            plannerPrompt,
            "You are a planning agent.",
            llmOptions
        );
        const jsonMatch = responseText.match(/```(json)?\s*([\s\S]+?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[2] : responseText;
        const parsedResponse = JSON.parse(jsonString);

        if (parsedResponse.plans && Array.isArray(parsedResponse.plans) && parsedResponse.plans.length > 0) {
            console.log(`[ToT] Planner: Successfully generated ${parsedResponse.plans.length} plans.`);
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
    if (!plans || plans.length === 0) {
        throw new Error("No plans provided to evaluate.");
    }
    if (plans.length === 1) {
        console.log('[ToT] Evaluator: Only one plan available. Selecting it by default.');
        return plans[0];
    }

    const { llmProvider, ...llmOptions } = requestContext;
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;
    const plansJsonString = JSON.stringify(plans, null, 2);

    const evaluatorPrompt = EVALUATOR_PROMPT_TEMPLATE
        .replace("{userQuery}", query)
        .replace("{plansJsonString}", plansJsonString);

    try {
        const responseText = await llmService.generateContentWithHistory(
            [],
            evaluatorPrompt,
            "You are an evaluating agent.",
            llmOptions
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

    for (let i = 0; i < winningPlan.steps.length; i++) {
        const stepDescription = winningPlan.steps[i];
        const thought = `Executing Step ${i + 1}/${winningPlan.steps.length}: ${stepDescription}`;
        streamCallback({ type: 'thought', content: thought });
        console.log(`[ToT] Executor: ${thought}`);
        
        const agentResponse = await processAgenticRequest(
            originalQuery,
            [],
            `Fulfill this sub-task: "${stepDescription}"`,
            requestContext
        );

        collectedContexts.push(`--- Context from Step ${i + 1} (${agentResponse.sourcePipeline}) ---\n${agentResponse.finalAnswer}`);
        
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

    const synthesizerPrompt = `You are an expert AI Tutor. A multi-step reasoning process has been completed to gather comprehensive information. Your task is to synthesize all the provided context into a single, cohesive, and well-structured final answer for the user's original query.\n\n--- COLLECTED CONTEXT ---\n${finalContext}\n\n--- ORIGINAL USER QUERY ---\n${originalQuery}`;

    const finalAnswer = await llmService.generateContentWithHistory(
        chatHistory,
        synthesizerPrompt,
        requestContext.systemPrompt,
        llmOptions
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
        streamAndStoreThought("Query is straightforward. Generating a direct response.");
        const directResponse = await processAgenticRequest(query, chatHistory, requestContext.systemPrompt, requestContext);
        streamCallback({ type: 'final_answer', content: directResponse.finalAnswer });
        return { finalAnswer: directResponse.finalAnswer, thoughts: allThoughts, references: directResponse.references, sourcePipeline: directResponse.sourcePipeline };
    }

    streamAndStoreThought("Complex query detected. Initiating multi-step reasoning process...");
    
    const plans = await generatePlans(query, requestContext);
    streamAndStoreThought(`Generated ${plans.length} potential plans. Evaluating the best approach...`);
    
    const winningPlan = await evaluatePlans(plans, query, requestContext);
    streamAndStoreThought(`Best plan selected: "${winningPlan.name}". Beginning execution...`);

    const { finalContext, allReferences } = await executePlan(winningPlan, query, requestContext, streamCallback);
    streamAndStoreThought("All information gathered. Synthesizing final answer...");

    const finalAnswer = await synthesizeFinalAnswer(query, finalContext, chatHistory, requestContext);
    streamCallback({ type: 'final_answer', content: finalAnswer });
    
    console.log('--- ToT Streaming Orchestration Finished ---');
    return {
        finalAnswer,
        thoughts: allThoughts,
        references: allReferences,
        sourcePipeline: `tot-${requestContext.llmProvider}`
    };
}

module.exports = {
    processQueryWithToT_Streaming
};