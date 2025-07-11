// server/services/totOrchestrator.js

const { processAgenticRequest } = require('./agentService'); // IMPORTANT: We now call the agent

/**
 * Helper function to write a Server-Sent Event (SSE) to the client.
 * @param {object} res - The Express response object.
 * @param {object} eventData - The data to send to the client.
 */
function streamEvent(res, eventData) {
    res.write(`data: ${JSON.stringify(eventData)}\n\n`);
}

/**
 * MOCKED Complexity Gate: Decides if a query needs the full ToT process.
 * In a real implementation, this would be a fast LLM call.
 * @param {string} query The user's query.
 * @returns {Promise<boolean>} True if the query is complex.
 */
async function isQueryComplex(query) {
    // Simple rule for testing: queries with multiple question marks or longer than 20 words are complex.
    const isComplex = (query.match(/\?/g) || []).length > 1 || query.split(' ').length > 20;
    console.log(`[ToT] Step 1: Complexity Gate. Query: "${query.substring(0, 30)}...". Decision: ${isComplex ? 'COMPLEX' : 'SIMPLE'}`);
    return isComplex;
}

/**
 * MOCKED Planner: Generates different high-level plans.
 * @param {string} query The user's query.
 * @returns {Promise<Array<Object>>} A list of plan objects.
 */
async function generatePlans(query) {
    console.log('[ToT] Step 2: Planner. Generating plans...');
    // In production, an LLM would generate these based on the query.
    // Each plan is an array of sub-tasks for the agent.
    const plans = [
        {
            name: "Structured Research Plan",
            steps: [
                "First, research the theoretical comparison between the two models using internal documents.",
                "Second, perform a web search for recent, real-world information on the topic."
            ]
        },
        {
            name: "Naive Combined Plan",
            steps: [
                "Perform a single, combined search using all keywords from the user's query."
            ]
        }
    ];
    return plans;
}

/**
 * MOCKED Evaluator: Selects the best plan.
 * @param {Array<Object>} plans The list of plans.
 * @returns {Promise<Object>} The winning plan object.
 */
async function evaluatePlans(plans) {
    console.log('[ToT] Step 3: Evaluator. Evaluating plans...');
    // In production, an LLM would rank these. We'll hardcode the choice for now.
    const winningPlan = plans[0]; // Always choose the "Structured Research Plan"
    console.log(`[ToT] Step 3: Evaluator. Winning plan selected: "${winningPlan.name}"`);
    return winningPlan;
}

/**
 * Executor: Executes the winning plan by calling the Agentic Router for each step.
 * @param {Object} winningPlan - The plan object with a `steps` array.
 * @param {string} originalQuery - The user's original full query.
 * @param {object} requestContext - The full context object for the agent.
 * @param {object} res - The Express response object for streaming thoughts.
 * @returns {Promise<string>} A string containing all the collected context.
 */
async function executePlan(winningPlan, originalQuery, requestContext, res) {
    console.log('[ToT] Step 4: Executor. Starting execution of plan...');
    let collectedContexts = [];

    for (let i = 0; i < winningPlan.steps.length; i++) {
        const stepDescription = winningPlan.steps[i];
        const thought = `Executing Step ${i + 1}/${winningPlan.steps.length}: ${stepDescription}`;
        streamEvent(res, { type: 'thought', content: thought });
        console.log(`[ToT] Executor: ${thought}`);
        
        // The Executor's job is to use the Agent for each sub-task.
        // We pass the *original query* to give the agent full context, but the sub-task
        // description could be used in a more advanced prompt to guide the agent.
        // For now, we rely on the agent's own routing based on the requestContext.
        const agentResponse = await processAgenticRequest(
            originalQuery, // Use the original query to ensure context is not lost
            [], // History is handled by the synthesizer later
            `Fulfill this sub-task: "${stepDescription}"`,
            requestContext
        );

        collectedContexts.push(`--- Context from Step ${i + 1} (${agentResponse.sourcePipeline}) ---\n${agentResponse.finalAnswer}`);
    }

    console.log('[ToT] Step 4: Executor. All steps executed.');
    return collectedContexts.join('\n\n');
}

/**
 * Synthesizer: Creates the final answer from all collected context.
 * @param {string} originalQuery - The user's original full query.
 * @param {string} finalContext - The combined context from all executor steps.
 * @param {Array} chatHistory - The full conversational history.
 * @param {object} requestContext - The context for the LLM call.
 * @returns {Promise<string>} The final, polished answer.
 */
async function synthesizeFinalAnswer(originalQuery, finalContext, chatHistory, requestContext) {
    console.log('[ToT] Step 5: Synthesizer. Creating final response...');
    const { llmProvider, ...llmOptions } = requestContext;
    const llmService = llmProvider === 'ollama' ? ollamaService : geminiService;

    const synthesizerPrompt = `You are an expert AI Tutor. A multi-step reasoning process has been completed to gather comprehensive information. Your task is to synthesize all the provided context into a single, cohesive, and well-structured final answer for the user's original query.\n\n--- COLLECTED CONTEXT ---\n${finalContext}\n\n--- ORIGINAL USER QUERY ---\n${originalQuery}`;

    const finalAnswer = await llmService.generateContentWithHistory(
        chatHistory,
        synthesizerPrompt,
        requestContext.systemPrompt, // Use the user's selected system prompt
        llmOptions
    );
    return finalAnswer;
}


/**
 * Main orchestration logic for the Tree of Thoughts process with streaming.
 * @param {string} query The user's query.
 * @param {Array} chatHistory The conversational history.
 * @param {object} requestContext The full context for the request.
 * @param {object} res The Express response object for streaming.
 * @returns {Promise<Object>} An object containing the final answer and all thoughts.
 */
async function processQueryWithToT_Streaming(query, chatHistory, requestContext, res) {
    const allThoughts = [];

    const streamAndStoreThought = (content) => {
        streamEvent(res, { type: 'thought', content });
        allThoughts.push(content);
    };

    const isComplex = await isQueryComplex(query);

    if (!isComplex) {
        streamAndStoreThought("Query is straightforward. Generating a direct response.");
        const directResponse = await processAgenticRequest(query, chatHistory, requestContext.systemPrompt, requestContext);
        streamEvent(res, { type: 'final_answer', content: directResponse.finalAnswer });
        return { finalAnswer: directResponse.finalAnswer, thoughts: allThoughts, references: directResponse.references, sourcePipeline: directResponse.sourcePipeline };
    }

    // --- Full ToT Flow ---
    streamAndStoreThought("Complex query detected. Initiating multi-step reasoning process...");
    
    const plans = await generatePlans(query);
    streamAndStoreThought(`Generated ${plans.length} potential plans. Evaluating the best approach...`);
    
    const winningPlan = await evaluatePlans(plans);
    streamAndStoreThought(`Best plan selected: "${winningPlan.name}". Beginning execution...`);

    const finalContext = await executePlan(winningPlan, query, requestContext, res);
    streamAndStoreThought("All information gathered. Synthesizing final answer...");

    const finalAnswer = await synthesizeFinalAnswer(query, finalContext, chatHistory, requestContext);
    streamEvent(res, { type: 'final_answer', content: finalAnswer });
    
    console.log('--- ToT Streaming Orchestration Finished ---');
    return { finalAnswer, thoughts: allThoughts, references: [], sourcePipeline: `tot-${requestContext.llmProvider}` };
}

module.exports = {
    processQueryWithToT_Streaming
};