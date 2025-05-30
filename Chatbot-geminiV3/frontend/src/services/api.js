// frontend/src/services/api.js
import axios from "axios";

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
  // --- Auth ---
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

  // --- Chat ---
  
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

  // --- Files ---
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

 
  
  // --- User LLM Config ---
  // Not completed yet❌
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

  // --- Status & Syllabus ---
  
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

