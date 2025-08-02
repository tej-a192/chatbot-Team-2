// server/services/toolExecutionService.js
const axios = require('axios');

const PYTHON_SERVICE_URL = process.env.PYTHON_RAG_SERVICE_URL;

async function queryPythonRagService(query, documentContextName, clientFilter = null, k = 5) {
    if (!PYTHON_SERVICE_URL) {
        throw new Error("RAG service is not configured on the server.");
    }
    const searchUrl = `${PYTHON_SERVICE_URL}/query`;
    
    const payload = {
        query: query,
        k: k,
        user_id: "agent_user", // The user is validated in Node.js; agent uses a generic ID for Python
        documentContextName: documentContextName || null,
        // CRITICAL FIX: Ensure filter is always an object, even if empty.
        // The Python service expects the key to exist.
        filter: clientFilter || {} 
    };

    try {
        const response = await axios.post(searchUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: process.env.PYTHON_RAG_TIMEOUT || 30000
        });
        
        const relevantDocs = response.data?.retrieved_documents_list || [];
        
        const references = relevantDocs.map((doc, index) => ({
            number: index + 1,
            source: doc.metadata?.file_name || doc.metadata?.original_name || 'Unknown Document',
            content_preview: (doc.page_content || "").substring(0, 150) + "...",
        }));
        
        const toolOutput = relevantDocs.length > 0
            ? response.data.formatted_context_snippet
            : "No relevant documents were found for this topic."; // More specific message
        
        return { references, toolOutput, retrieved_documents_list: relevantDocs }; // Pass full list back

    } catch (error) {
        let errorMsg = error.message;
        if (error.response?.data?.error) errorMsg = `Python Service Error: ${error.response.data.error}`;
        else if (error.code === 'ECONNABORTED') errorMsg = 'Python RAG service request timed out.';
        console.error(`[toolExecutionService] Error calling Python RAG service at ${searchUrl}:`, errorMsg);
        throw new Error(errorMsg);
    }
}


async function queryKgService(query, documentName, userId) {
    if (!PYTHON_SERVICE_URL) {
        throw new Error("Knowledge Graph service is not configured on the server.");
    }
    // Assuming the Python endpoint for KG search is /query_kg
    const kgUrl = `${PYTHON_SERVICE_URL}/query_kg`; 
    try {
        const response = await axios.post(kgUrl, {
            query: query,
            document_name: documentName,
            user_id: userId,
        }, { timeout: 20000 });

        return {
            references: [], // KG search doesn't produce citable references in the same way
            toolOutput: response.data?.facts || "No specific facts were found in the knowledge graph for this query."
        };
    } catch (error) {
        const errorMsg = error.response?.data?.error || `KG Service Error: ${error.message}`;
        console.error(`[toolExecutionService] Error calling KG service:`, errorMsg);
        // Return a user-friendly message within the tool's output
        return {
            references: [],
            toolOutput: `Could not retrieve facts from knowledge graph: ${errorMsg}`
        };
    }
}

module.exports = {
    queryPythonRagService,
    queryKgService
};