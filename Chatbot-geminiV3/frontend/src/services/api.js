// frontend/src/services/api.js
import axios from "axios";
import toast from "react-hot-toast";

// --- CENTRAL CONTROL FLAG FOR MOCKING ---
const DEV_MODE_MOCK_API = false; // <--- SET THIS TO false

// --- Axios API Client (for real backend calls) ---
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api",
});





// Axios Request Interceptor to add JWT token
apiClient.interceptors.request.use( 
  (config) => {
    const token = localStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Axios Response Interceptor to handle common errors (e.g., 401)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.error("API Interceptor: Received 401 Unauthorized. Token might be invalid or expired.");
      // The AuthContext will handle the actual logout logic and UI update.
      // We can dispatch a custom event that AuthContext can listen for,
      // or AuthContext can catch the error from the API call directly.
      // For simplicity, AuthContext will catch the error from the API call.
      // localStorage.removeItem('authToken'); // AuthContext will handle this.
    }
    return Promise.reject(error);
  }
);

// --- API Definition Object ---
const api = {
  
    // --- Helper to fetch stored analysis (can be internal to this module) ---
  _getStoredDocumentAnalysis: async (documentFilename) => {
    try {
      // This GET request fetches the whole analysis object { faq, topics, mindmap }
      const response = await apiClient.get(`/analysis/${encodeURIComponent(documentFilename)}`);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.info(`No stored analysis found for document: ${documentFilename}`);
        return null; // Return null if no analysis record exists for the document
      }
      console.error(`Error fetching stored analysis for ${documentFilename}:`, error);
      throw error; // Re-throw other errors to be handled by the caller
    }
  },

  // --- Unified and Intelligent requestAnalysis function ---
  // This function is called by AnalysisTool.jsx's "Run" button.
  requestAnalysis: async (payload) => {
    // payload will be like { filename: "doc.pdf", analysis_type: "faq" }
    const { filename, analysis_type } = payload;

    if (!filename || !analysis_type) {
      toast.error("Filename and analysis type are required.");
      throw new Error("Filename and analysis_type are required for requestAnalysis.");
    }

    const toastId = toast.loading(`Checking for stored ${analysis_type} for "${filename}"...`);

    try {
      // 1. Attempt to fetch existing analysis data from MongoDB via our backend
      const storedAnalysisData = await api._getStoredDocumentAnalysis(filename);

      if (storedAnalysisData && 
          storedAnalysisData[analysis_type] && 
          typeof storedAnalysisData[analysis_type] === 'string' &&
          storedAnalysisData[analysis_type].trim() !== "") {
        // Real data found for the specific analysis_type
        toast.success(`Displaying stored ${analysis_type} for "${filename}".`, { id: toastId });
        return {
          content: storedAnalysisData[analysis_type],
          thinking: `Retrieved stored ${analysis_type} data from the database.`
        };
      } else {
        // No stored data, or the specific field is empty. Proceed to mock generation.
        toast.dismiss(toastId); // Dismiss the "checking" toast
        const generationToastId = toast.loading(`No stored ${analysis_type}. Generating new analysis for "${filename}"... (Mock V1)`);
        console.warn(`No valid stored ${analysis_type} found for "${filename}". Falling back to mock generation.`);

        // --- MOCK GENERATION LOGIC (as per your original AnalysisTool's expectation) ---
        // This part simulates what would happen in V2 if you hit a backend endpoint
        // to *generate* new analysis, which would then save it to MongoDB.
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000)); // Simulate delay

        let mockContent = "";
        const thinkingMessage = `Mock generation for ${analysis_type} on "${filename}". In a real scenario, this would involve AI processing and database updates.`;

        switch (analysis_type) {
          case 'faq':
            mockContent = `## Mock FAQs for ${filename}\n\nQ: What is this document about?\nA: This is mock FAQ content for ${filename}.\n\nQ: How is this generated?\nA: Through a mock API call when no stored data is found.`;
            break;
          case 'topics':
            mockContent = `### Mock Key Topics for ${filename}\n\n- Topic A: Mock Data Integration\n- Topic B: Placeholder Information\n- Topic C: ${analysis_type.toUpperCase()} specific to ${filename}`;
            break;
          case 'mindmap':
            mockContent = `mindmap\n  root((${filename} - Mock Mindmap))\n    Overview\n      Key Point 1\n      Key Point 2\n    Details\n      Specific Detail A\n      Specific Detail B`;
            break;
          default:
            mockContent = `Mock content for an unknown analysis type '${analysis_type}' on ${filename}.`;
        }
        // In a real V2, the backend endpoint responsible for *generating* this analysis
        // would save `mockContent` (the real generated content) to the database:
        // User.uploadedDocuments.find(doc => doc.filename === filename).analysis[analysis_type] = realGeneratedContent;
        // await user.save();
        // For V1, this frontend mock doesn't save.
        toast.success(`${analysis_type} generated (mock data) for "${filename}".`, { id: generationToastId });
        return {
          content: mockContent,
          thinking: thinkingMessage
        };
        // --- END MOCK GENERATION LOGIC ---
      }
    } catch (error) {
      toast.error(`Error processing ${analysis_type} for "${filename}": ${error.message || 'Unknown error'}`, { id: toastId });
      console.error(`Error in requestAnalysis for ${filename} (${analysis_type}):`, error);
      // Return a structure that AnalysisTool can handle to display an error
      return {
        content: `Error: Could not retrieve or generate ${analysis_type} for "${filename}".\n${error.message}`,
        thinking: "An error occurred during the analysis process."
      };
    }
  },
  // ------------------------------------------------- Auth --------------------------------------------------
 
  // Completed✅
  login: async (credentials) => {
    const response = await apiClient.post("/auth/signin", credentials);
    return response.data; // Expects { token, _id, username, sessionId, message }
  },

  // Completed✅
  signup: async (userData) => {
    const response = await apiClient.post("/auth/signup", userData);
    return response.data; // Expects { token, _id, username, sessionId, message }
  },

  // Completed✅
  getMe: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data; // Expects { _id, username, ... }
  },

  // ------------------------------------------------ Chat -----------------------------------------------
  
  // Not completed yet❌
  sendMessage: async (payload) => {
    const response = await apiClient.post("/chat/message", payload);
    return response.data; // Expects { reply: { role, parts, timestamp, ... } }
  },

  // Not completed yet❌
  getChatHistory: async (sessionId) => {
    const response = await apiClient.get(`/chat/session/${sessionId}`);
    // Backend returns the full session object which includes { messages: [...] }
    return response.data.messages || []; 
  },

  // Not completed yet❌
  getChatSessions: async () => {
    const response = await apiClient.get("/chat/sessions");
    return response.data; // Expects array of session summaries
  },

  // Not completed yet❌
  startNewSession: async () => {
    // This call is to the backend's /api/chat/history to get a new session ID
    // when the user explicitly clicks "New Chat" and is already logged in.
    // The backend creates a new session placeholder if needed and returns a new UUID.
    const response = await apiClient.post("/chat/history", { 
        sessionId: `client-initiate-${Date.now()}`, // Temporary ID, backend replaces it
        messages: [] 
    });
    // Expects { message, savedSessionId (can be null), newSessionId }
    return { sessionId: response.data.newSessionId };
  },

  // Not completed yet❌
  saveChatHistory: async (sessionId, messages) => {
    const response = await apiClient.post("/chat/history", { sessionId, messages });
    return response.data; // Expects { message, savedSessionId, newSessionId }
  },

 
  // -------------------------------------------------- Files ------------------------------------------------------
  
  // Completed✅
  uploadFile: async (formData, onUploadProgress) => {
    const response = await apiClient.post("/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    });
    return response.data; // Expects { message, filename (serverFilename), originalname }
  },
  
  // Completed✅
  getFiles: async () => {
     
    const response = await apiClient.get("/files");
    console.log("Response from /files ; ", response.data);
    
    return response.data; // Expects array of file objects
  },

  // Completed✅
  deleteFile: async (serverFilename) => {
    const response = await apiClient.delete(`/files/${serverFilename}`);
    return response.data;
  },
  
  // -------------------------------------------- User LLM Config ---------------------------------------------------
  
  // Not completed yet❌-
  updateUserLLMConfig: async (configData) => {
    // For V2, if backend stores user LLM preferences:
    // const response = await apiClient.post('/user/config/llm', configData);
    // return response.data;
    console.warn("api.updateUserLLMConfig (frontend): Node.js backend doesn't have a dedicated user config endpoint yet. This is a local mock via api.js.");
    return new Promise(resolve => setTimeout(() => {
        localStorage.setItem("selectedLLM", configData.llmProvider); // Still update local for UI
        if (configData.apiKey) localStorage.setItem("mockGeminiApiKeyStatus", "set");
        if (configData.ollamaUrl) localStorage.setItem("mockOllamaUrl", configData.ollamaUrl);
        resolve({ message: `LLM preference for ${configData.llmProvider} noted (local mock via API layer).` });
    }, 100));
  },

  // Not completed yet❌
  getUserLLMConfig: async () => {
    // For V2, if backend stores user LLM preferences:
    // const response = await apiClient.get('/user/config/llm');
    // return response.data; // expects { llmProvider }
    console.warn("api.getUserLLMConfig (frontend): Node.js backend doesn't have a dedicated user config endpoint yet. Returning local default via api.js.");
    return new Promise(resolve => setTimeout(() => {
        resolve({ llmProvider: localStorage.getItem("selectedLLM") || "ollama" });
    }, 50));
  },


  // ----------------------------------------------- Status & Syllabus -------------------------------------------
  
  // Not completed yet❌
  getOrchestratorStatus: async () => {
    // For V2, Node.js backend could have its own /api/status endpoint.
    // For now, this simulates a status.
    console.warn("api.getOrchestratorStatus (frontend): Using a local mock via API layer for backend status.");
    return new Promise(resolve => setTimeout(() => {
        resolve({
            status: "ok",
            message: "Backend (Node.js - Mocked Status via Frontend API)",
            database_status: "Connected (Mock)",
        });
    }, 50));
    // Example real call:
    // const response = await apiClient.get('/status'); // Assuming /api/status on Node.js backend
    // return response.data;
  },

  // Not completed yet❌
  getSyllabus: async (subjectId) => {
    const response = await apiClient.get(`/syllabus/${subjectId}`);
    return response.data.syllabus; // Backend returns { syllabus: "markdown_content" }
  },

  // Not completed yet❌
  getMindmap: async () => {
    const response = await apiClient.get('/mindmap'); // Assumes /api/mindmap on backend
    return response.data; // Expects { mermaidCode: "...", source: "..." }
  }
};

export default api;

