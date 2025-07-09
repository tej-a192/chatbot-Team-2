

// server/services/toolRegistry.js
const { performWebSearch } = require('./webSearchService.js');
const { queryPythonRagService, queryKgService } = require('./toolExecutionService.js');
const axios = require('axios');

// Helper function to call the Python academic search endpoint
async function queryAcademicService(query) {
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        throw new Error("Academic search service is not configured on the server.");
    }
    const searchUrl = `${pythonServiceUrl}/academic_search`;
    
    try {
        const response = await axios.post(searchUrl, { query }, { timeout: 45000 });
        const papers = response.data?.results || [];
        
        // Format the results into a string for the LLM to synthesize
        const toolOutput = papers.length > 0
            ? "Found the following relevant academic papers:\n\n" + papers.map((p, index) => 
                `[${index + 1}] **${p.title || 'Untitled Paper'}**\n` +
                `   - Authors: ${p.authors ? p.authors.join(', ') : 'N/A'}\n` +
                `   - Source: ${p.source || 'Unknown'}\n` +
                `   - URL: ${p.url || '#'}\n` +
                `   - Summary: ${p.summary ? p.summary.substring(0, 300) + '...' : 'No summary available.'}`
              ).join('\n\n')
            : "No relevant academic papers were found for this query.";

        return { references: [], toolOutput };

    } catch (error) {
        const errorMsg = error.response?.data?.error || `Academic Service Error: ${error.message}`;
        console.error(`[toolRegistry] Error calling academic search service:`, errorMsg);
        throw new Error(errorMsg);
    }
}

const availableTools = {
  web_search: {
    description: "Use this tool to search the internet for real-time, up-to-date information.",
    execute: async (params) => {
        const searchResultsString = await performWebSearch(params.query);
        return {
            references: [],
            toolOutput: searchResultsString || "No results found from web search.",
        };
    },
    requiredParams: ['query'],
  },
  rag_search: {
    description: "Use this tool to search the content of a specific, user-provided document.",
    execute: async (params, context) => {
        return await queryPythonRagService(
            params.query,
            context.documentContextName,
            context.filter
        );
    },
    requiredParams: ['query'],
  },
  kg_search: {
    description: "Use this tool to find structured facts and relationships within a document's knowledge graph.",
     execute: async (params, context) => {
        const facts = await queryKgService(
            params.query,
            context.documentContextName,
            context.userId
        );
        return {
            references: [],
            toolOutput: facts,
        };
    },
    requiredParams: ['query'],
  },
  academic_search: {
    description: "Use this tool to find academic papers, research articles, and scholarly publications.",
    execute: async (params) => {
        return await queryAcademicService(params.query);
    },
    requiredParams: ['query'],
  }
};

module.exports = {
    availableTools,
};