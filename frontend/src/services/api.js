// frontend/src/services/api.js
import axios from "axios";
import toast from "react-hot-toast";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api",
});

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

const api = {
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
  startNewSession: async (previousSessionId, skipAnalysis = false) => {
    const response = await apiClient.post("/chat/history", {
      previousSessionId,
      skipAnalysis
    });
    return response.data;
  },
  deleteChatSession: async (sessionId) => {
    const response = await apiClient.delete(`/chat/session/${sessionId}`);
    return response.data;
  },
  uploadFile: async (formData, onUploadProgress) => {
    const response = await apiClient.post("/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    });
    return response.data;
  },
  // getFiles: async () => {
  //   const response = await apiClient.get("/files");
  //   return response.data;
  // },
  // deleteFile: async (serverFilename) => {
  //   const response = await apiClient.delete(`/files/${serverFilename}`);
  //   return response.data;
  // },
  getKnowledgeSources: async () => {
    const response = await apiClient.get("/knowledge-sources");
    return response.data;
  },
  deleteKnowledgeSource: async (sourceId) => {
    const response = await apiClient.delete(`/knowledge-sources/${sourceId}`);
    return response.data;
  },
  addUrlSource: async (url) => {
    const response = await apiClient.post("/knowledge-sources", {
      type: "url",
      content: url,
    });
    return response.data; // Returns the initial source object with "processing" status
  },
  updateUserLLMConfig: async (configData) => {
    console.log("[Frontend API] Sending LLM config update:", configData);
    const response = await apiClient.put("/llm/config", configData);
    return response.data;
  },
  getOrchestratorStatus: async () => {
    try {
      const response = await apiClient.get("/network/ip");
      return {
        status: "ok",
        message: `Backend Online at ${response.data.ips[0]}`,
      };
    } catch (e) {
      return { status: "error", message: "Backend Unreachable" };
    }
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
  requestAnalysis: async (payload) => {
    const { filename, analysis_type } = payload;
    if (!filename || !analysis_type) {
      throw new Error("Filename and analysis type are required.");
    }
    const toastId = toast.loading(
      `Generating ${analysis_type} for "${filename}"...`
    );
    try {
      const response = await apiClient.get(
        `/analysis/${encodeURIComponent(filename)}`
      );
      const fullAnalysisObject = response.data;
      const rawOutput = fullAnalysisObject[analysis_type];
      if (
        !rawOutput ||
        typeof rawOutput !== "string" ||
        rawOutput.trim() === ""
      ) {
        toast.success(`No stored ${analysis_type} found for "${filename}".`, {
          id: toastId,
        });
        return {
          content: `Notice: Analysis for '${analysis_type}' has not been generated yet or was empty.`,
          thinking: "No analysis data found in  the database for this type.",
        };
      }
      const { content, thinking } = parseAnalysisOutput(rawOutput);
      toast.success(
        `Successfully generated ${analysis_type} for "${filename}".`,
        { id: toastId }
      );
      return { content, thinking };
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || error.message || "Unknown error";
      toast.error(`Error generating ${analysis_type}: ${errorMessage}`, {
        id: toastId,
      });
      throw error;
    }
  },
  generatePodcast: async ({
    analysisContent,
    sourceDocumentName,
    podcastOptions,
  }) => {
    const response = await apiClient.post(
      "/export/podcast",
      { analysisContent, sourceDocumentName, podcastOptions },
      { responseType: "blob" }
    );
    return { audioBlob: response.data, sourceDocumentName };
  },
  getKnowledgeGraph: async (documentName) => {
    const response = await apiClient.get(
      `/kg/visualize/${encodeURIComponent(documentName)}`
    );
    return response.data;
  },
  getSessionKnowledgeGraph: async (sessionId) => {
    const response = await apiClient.get(
      `/kg/session/${encodeURIComponent(sessionId)}`
    );
    return response.data;
  },
  executeCode: async (payload) => {
    const response = await apiClient.post("/tools/execute", payload);
    return response.data;
  },
  analyzeCode: async (payload) => {
    const response = await apiClient.post("/tools/analyze-code", payload);
    return response.data;
  },
  generateTestCases: async (payload) => {
    const response = await apiClient.post(
      "/tools/generate-test-cases",
      payload
    );
    return response.data;
  },
  explainError: async (payload) => {
    const response = await apiClient.post("/tools/explain-error", payload);
    return response.data;
  },
  getRecommendations: async (sessionId) => {
    const response = await apiClient.get(
      `/learning/recommendations/${sessionId}`
    );
    return response.data;
  },

  findDocumentForTopic: async (topic) => {
    const response = await apiClient.post("/learning/find-document", { topic });
    return response.data;
  },
  getLearningPaths: async () => {
    const response = await apiClient.get("/learning/paths");
    return response.data;
  },

  generateLearningPath: async (goal, context = null) => {
    const response = await apiClient.post("/learning/paths/generate", {
      goal,
      context,
    });
    return response.data;
  },

  updateModuleStatus: async (pathId, moduleId, status) => {
    const response = await apiClient.put(
      `/learning/paths/${pathId}/modules/${moduleId}`,
      { status }
    );
    return response.data;
  },

  generateQuiz: async (file, quizOption) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("quizOption", quizOption); // <<< Send the descriptive string

    const response = await apiClient.post("/tools/generate-quiz", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 300000,
    });
    return response.data; // Should be { quiz: [...] }
  },
  analyzePrompt: async (promptText) => {
    const response = await apiClient.post("/chat/analyze-prompt", {
      prompt: promptText,
    });
    return response.data; // Expects { improvedPrompt, explanation }
  },
   // --- Academic Integrity Tools ---
  submitIntegrityCheck: async ({ text }) => {
    const response = await apiClient.post("/tools/analyze-integrity/submit", { text });
    return response.data; // Expects { reportId, initialReport }
  },
  
  getIntegrityReport: async (reportId) => {
    const response = await apiClient.get(`/tools/analyze-integrity/report/${reportId}`);
    return response.data; // Expects the full report object with status updates
  },
  deleteLearningPath: async (pathId) => {
    const response = await apiClient.delete(`/learning/paths/${pathId}`);
    return response.data;
  },
  generateDocument: async (payload) => {
    // This function now handles the entire download process, including error handling.
    const response = await apiClient.post("/generate/document", payload, { 
        responseType: "blob" // Crucial: expect a file blob
    });

    // --- THIS IS THE FIX ---
    // If the server sent back a JSON error instead of a file, it will have this content type.
    if (response.data.type === 'application/json') {
        const errorText = await response.data.text();
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.message || "An unknown error occurred during generation.");
    }
    // --- END OF FIX ---

    const contentDisposition = response.headers["content-disposition"];
    let filename = `generated-document.${payload.docType}`;
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
      if (filenameMatch && filenameMatch.length > 1) {
        filename = filenameMatch[1];
      }
    }
    
    // Trigger browser download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return { success: true, filename }; // Return success for toast messages
  },
   generateDocumentFromTopic: async (payload) => {
    const { topic, docType } = payload;
    const response = await apiClient.post(
      `/generate/document/from-topic`,
      { topic, docType },
      { responseType: "blob" } // CRITICAL: This tells axios to expect a file
    );

    // Extract filename from the 'Content-Disposition' header
    const contentDisposition = response.headers["content-disposition"];
    let filename = `generated-document.${docType}`; // a fallback
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
      if (filenameMatch && filenameMatch.length > 1) {
        filename = filenameMatch[1];
      }
    }
    
    // Create a temporary link to trigger the browser's automatic download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();

    // Clean up the temporary link from memory
    link.parentNode.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return { success: true, filename }; // Return success status for the toast
  },

};


export default api;