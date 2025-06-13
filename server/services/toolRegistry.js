// server/services/toolRegistry.js
const { performWebSearch } = require('./webSearchService.js');
const { queryPythonRagService } = require('./ragQueryService.js');

const availableTools = {
  web_search: {
    description: "Use this tool to search the internet for real-time, up-to-date information. It is required for questions about current events, recent developments, or any topic where fresh, external information is necessary.",
    // --- FIX: `execute` now accepts `params` from LLM and `context` from our server ---
    execute: async (params, context) => {
    // --- END FIX ---
        if (!params.query) {
            throw new Error("Web search was called without a 'query' parameter.");
        }
        const searchResultsString = await performWebSearch(params.query);
        return {
            references: [],
            toolOutput: searchResultsString || "No results found from web search.",
        };
    },
    requiredParams: ['query'],
  },
  rag_search: {
    description: "Use this tool to search the content of a specific, user-provided document. This is the only way to answer questions specifically about the user's document.",
    // --- FIX: `execute` now accepts `params` from LLM and `context` from our server ---
    execute: async (params, context) => {
    // --- END FIX ---
        if (!params.query) {
            throw new Error("RAG search was called without a 'query' parameter.");
        }
        // Use the context object for the parameters that the LLM doesn't know about.
        return await queryPythonRagService(
            params.query,
            context.documentContextName,
            context.criticalThinkingEnabled,
            context.filter
        );
    },
    requiredParams: ['query'],
  },
};

module.exports = {
    availableTools,
};