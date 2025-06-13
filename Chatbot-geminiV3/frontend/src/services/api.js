// frontend/src/services/api.js
import axios from "axios";
import toast from "react-hot-toast";

// --- Axios API Client (for real backend calls) ---
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api",
});

// Axios Request Interceptor to add JWT tokens
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
    }
    return Promise.reject(error);
  }
);

function parseAnalysisOutput(rawOutput) {
    if (!rawOutput || typeof rawOutput !== 'string') {
        return { content: '', thinking: '' };
    }
    const thinkingMatch = rawOutput.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    let thinkingText = '';
    let mainContent = rawOutput;

    if (thinkingMatch && thinkingMatch[1]) {
        thinkingText = thinkingMatch[1].trim();
        mainContent = rawOutput.replace(/<thinking>[\s\S]*?<\/thinking>\s*/i, '').trim();
    }
    return { content: mainContent, thinking: thinkingText };
}


// --- API Definition Object ---
const api = {
  
  requestAnalysis: async (payload) => {
    const { filename, analysis_type } = payload;
    if (!filename || !analysis_type) {
      throw new Error("Filename and analysis type are required for requestAnalysis.");
    }
    const toastId = toast.loading(`Fetching stored ${analysis_type} for "${filename}"...`);
    try {
      const response = await apiClient.get(`/analysis/${encodeURIComponent(filename)}`);
      const fullAnalysisObject = response.data;

      const rawOutput = fullAnalysisObject[analysis_type];

      if (!rawOutput || typeof rawOutput !== 'string' || rawOutput.trim() === "") {
         toast.success(`No stored ${analysis_type} found for "${filename}".`, { id: toastId });
         return {
            content: `Notice: Analysis for '${analysis_type}' has not been generated yet or was empty.`,
            thinking: "No analysis data found in the database for this type."
         };
      }
      
      const { content, thinking } = parseAnalysisOutput(rawOutput);
      
      toast.success(`Successfully retrieved stored ${analysis_type} for "${filename}".`, { id: toastId });
      return {
          content: content,
          thinking: thinking || `Retrieved stored ${analysis_type} data.`
      };

    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
      toast.error(`Error fetching ${analysis_type}: ${errorMessage}`, { id: toastId });
      console.error(`Error in requestAnalysis for ${filename} (${analysis_type}):`, error);
      return {
          content: `Error: Could not retrieve analysis for "${filename}".\n${errorMessage}`,
          thinking: "An error occurred while fetching the analysis data from the server."
      };
    }
  },

  login: async (credentials) => {
    const response = await apiClient.post("/auth/signin", credentials);
    return response.data;
  },

  signup: async (userData) => {
    const response = await apiClient.post("/auth/signup", userData);
    return response.data;
  },

  getMe: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data;
  },

  sendMessage: async (payload) => {
    const response = await apiClient.post("/chat/message", payload);
    return response.data;
  },

  getChatHistory: async (sessionId) => {
    const response = await apiClient.get(`/chat/session/${sessionId}`);
    return response.data;
  },

  getChatSessions: async () => {
    const response = await apiClient.get("/chat/sessions");
    return response.data;
  },

  startNewSession: async (previousSessionId) => {
    const response = await apiClient.post("/chat/history", { previousSessionId });
    return response.data;
  },

  uploadFile: async (formData, onUploadProgress) => {
    const response = await apiClient.post("/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    });
    return response.data;
  },

  getFiles: async () => {
    const response = await apiClient.get("/files");
    return response.data;
  },

  deleteFile: async (serverFilename) => {
    const response = await apiClient.delete(`/files/${serverFilename}`);
    return response.data;
  },

  updateUserLLMConfig: async (configData) => {
    console.warn("api.updateUserLLMConfig: This is a local mock via api.js.");
    return new Promise(resolve => setTimeout(() => {
      localStorage.setItem("selectedLLM", configData.llmProvider);
      resolve({ message: `LLM preference for ${configData.llmProvider} noted (local mock).` });
    }, 100));
  },

  getOrchestratorStatus: async () => {
    return new Promise(resolve => setTimeout(() => {
      resolve({
        status: "ok",
        message: "Backend (Node.js - Mocked Status via Frontend API)",
      });
    }, 50));
  },
  
  getUserProfile: async () => {
    const response = await apiClient.get("/user/profile");
    return response.data;
  },

  updateUserProfile: async (profileData) => {
    const response = await apiClient.put("/user/profile", profileData);
    return response.data;
  },

  getSubjects: async () => {
    const response = await apiClient.get("/subjects");
    return response.data;
  },

  getSyllabus: async (subjectId) => {
    const response = await apiClient.get(`/syllabus/${subjectId}`);
    return response.data.syllabus;
  },

  getMindmap: async () => {
    const response = await apiClient.get('/mindmap');
    return response.data;
  },

  // --- MODIFIED FUNCTION FOR BLOB-BASED DOWNLOAD ---
  generateDocument: async ({ markdownContent, docType, sourceDocumentName }) => {
    const response = await apiClient.post('/generate/document', 
      { markdownContent, docType, sourceDocumentName },
      { responseType: 'blob' } // Request the response as a binary blob
    );
    
    // Extract filename from the Content-Disposition header
    const contentDisposition = response.headers['content-disposition'];
    let filename = `generated-document.${docType}`; // A fallback filename
    if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch && filenameMatch.length > 1) {
            filename = filenameMatch[1];
        }
    }
    
    return { fileBlob: response.data, filename: filename };
  }
};

export default api;