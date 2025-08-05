// server/services/toolRegistry.js
const { performWebSearch } = require('./webSearchService.js');
const { queryPythonRagService, queryKgService } = require('./toolExecutionService.js');
const axios = require('axios');
const documentGenerationService = require('./documentGenerationService.js'); // <-- ADD THIS IMPORT

async function queryAcademicService(query) {
    // ... (existing function is unchanged)
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
    if (!pythonServiceUrl) {
        throw new Error("Academic search service is not configured on the server.");
    }
    const searchUrl = `${pythonServiceUrl}/academic_search`;
    
    try {
        console.log(`[toolRegistry] Calling Python academic search at ${searchUrl} for query: "${query}"`);
        const response = await axios.post(searchUrl, { query }, { timeout: 45000 });
        const papers = response.data?.results || [];
        
        const toolOutput = papers.length > 0
            ? "Found the following relevant academic papers:\n\n" + papers.map((p, index) => 
                `[${index + 1}] **${p.title || 'Untitled Paper'}**\n` +
                `   - Source: ${p.source || 'Unknown'}\n` +
                `   - URL: ${p.url || '#'}\n` +
                `   - Summary: ${p.summary ? p.summary.substring(0, 300) + '...' : 'No summary.'}`
              ).join('\n\n')
            : "No relevant academic papers were found for this query.";
            
        const references = papers.map((p, index) => ({
            number: index + 1,
            source: `${p.title || 'Untitled Paper'} (${p.source || 'N/A'})`,
            url: p.url || '#',
        }));

        return { references, toolOutput };

    } catch (error) {
        const errorMsg = error.response?.data?.error || `Academic Service Error: ${error.message}`;
        throw new Error(errorMsg);
    }
}

const availableTools = {
  web_search: {
    description: "Searches the internet for real-time, up-to-date information on current events, public figures, or general knowledge.",
    execute: async (params) => {
        const { toolOutput, references } = await performWebSearch(params.query);
        return { references, toolOutput: toolOutput || "No results found from web search." };
    },
    requiredParams: ['query'],
  },
  rag_search: {
    description: "Searches the content of a specific, user-provided document to answer questions based on its text.",
    execute: async (params, context) => {
        return await queryPythonRagService(
            params.query, 
            context.documentContextName, 
            context.userId, // <-- Pass the userId
            context.criticalThinkingEnabled, // <-- Pass the flag
            context.filter
        );
    },
    requiredParams: ['query'],
  },
  kg_search: {
    description: "Finds structured facts and relationships within a document's pre-built knowledge graph. Use this to complement RAG search.",
     execute: async (params, context) => {
        const facts = await queryKgService(params.query, context.documentContextName, context.userId);
        return { references: [], toolOutput: facts };
    },
    requiredParams: ['query'],
  },
  academic_search: {
    description: "Finds academic papers, research articles, and scholarly publications from scientific databases.",
    execute: async (params) => {
        return await queryAcademicService(params.query);
    },
    requiredParams: ['query'],
  },
  // --- NEW TOOL DEFINITION ---
  generate_document: {
    description: "Use this tool ONLY when the user explicitly asks to 'create', 'generate', 'make', or 'download' a document, presentation, summary, DOCX, or PPTX. The tool requires a topic, a document type (either 'docx' or 'pptx'), and the source of information to use.",
    execute: async (params, context) => {
      const { topic, doc_type, context_source } = params;
      const { userId, chatHistory, documentContextName } = context;

      const generationResult = await documentGenerationService.generateAndProxyDocument(
        userId,
        topic,
        doc_type,
        context_source,
        chatHistory,
        documentContextName
      );
      
      // The tool's output is a special object, not plain text.
      return { 
        toolOutput: { type: 'document_generated', payload: generationResult },
        references: [] // No references for this tool
      };
    },
    // The LLM must determine these parameters from the user's request.
    requiredParams: [
        { name: 'topic', description: 'The main subject or title of the document to be created.' },
        { name: 'doc_type', description: "The file format. Must be either 'docx' for a text document or 'pptx' for a presentation." },
        { name: 'context_source', description: "The source of information for the document. Must be one of: 'selected_document' if a document is currently selected in the UI, 'chat_history' if the user refers to the current conversation, or 'none' if the user asks for a general document on a topic without specifying a context."}
    ],
  }
};

module.exports = { availableTools };