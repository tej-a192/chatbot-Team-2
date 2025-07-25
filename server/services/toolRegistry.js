

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
        console.log(`[toolRegistry] Calling Python academic search at ${searchUrl} for query: "${query}"`);
        const response = await axios.post(searchUrl, { query }, { timeout: 45000 });
        const papers = response.data?.results || [];
        
        // --- THIS IS THE FIX ---
        // Format the results into a string with all necessary details for the Synthesizer prompt
        const toolOutput = papers.length > 0
            ? "Found the following relevant academic papers:\n\n" + papers.map((p, index) => 
                `[${index + 1}] Title: ${p.title || 'Untitled Paper'}\n` +
                `   Source: ${p.source || 'Unknown'}\n` +
                `   URL: ${p.url || '#'}\n` +
                `   Authors: ${p.authors ? p.authors.join(', ') : 'N/A'}\n` +
                `   Summary: ${p.summary ? p.summary.substring(0, 400).replace(/\s+/g, ' ') + '...' : 'No summary available.'}`
              ).join('\n\n')
            : "No relevant academic papers were found for this query.";
        
        const references = papers.map((p, index) => ({
            number: index + 1,
            source: `${p.authors ? p.authors.slice(0, 2).join(', ') + (p.authors.length > 2 ? ', et al.' : '') : 'N/A'}. (${p.source || 'N/A'})`,
            content_preview: p.title || 'Untitled Paper',
        }));

        return { references, toolOutput };
        // --- END OF FIX ---

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