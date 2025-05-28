// frontend/src/services/api.js
import axios from "axios";

// --- CENTRAL CONTROL FLAG FOR MOCKING ---
// << SET THIS TO false TO USE REAL BACKEND & JWT AUTHENTICATION >>
const DEV_MODE_MOCK_API = true;
// When false, this file will attempt to make real API calls to your Node.js backend.
// Ensure your Node.js backend is running and configured for JWTs.
// Ensure your AuthContext.jsx has DEV_MODE_ALLOW_DEV_LOGIN = false if you want to force forms.

const mockDelay = (ms = 200) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// --- MOCK DATA STORE (Only used if DEV_MODE_MOCK_API is true) ---
const MOCK_USER_DATA_STORE = {
  devUser001: { username: "DevUI-User", _id: "devUser001" },
};

let MOCK_SESSIONS_STORE = {
  "session-mock-1": {
    sessionId: "session-mock-1",
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    messageCount: 4,
    preview: "Thermodynamics basics and applications...",
  },
  "session-mock-2": {
    sessionId: "session-mock-2",
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
    messageCount: 6,
    preview: "Exploring quantum entanglement simply...",
  },
  "dev-initial-session-appstate": {
    sessionId: "dev-initial-session-appstate",
    updatedAt: new Date().toISOString(),
    messageCount: 2,
    preview: "Initial development session for UI testing...",
  },
};

let MOCK_CHAT_HISTORY_STORE = {
  "session-mock-1": [
    {
      id: "s1msg1",
      _id: "s1msg1",
      role: "user",
      parts: [
        {
          text: "Hello AI tutor! Can you explain the first law of thermodynamics?",
        },
      ],
      timestamp: new Date(Date.now() - 3550000).toISOString(),
    },
    {
      id: "s1msg2",
      _id: "s1msg2",
      role: "model",
      parts: [
        {
          text: "Certainly! The first law of thermodynamics, also known as the law of conservation of energy, states that energy cannot be created or destroyed in an isolated system. It can only be transformed from one form to another. \n\nFor example, in a heat engine, chemical energy in fuel is converted into thermal energy, which is then converted into mechanical work.",
        },
      ],
      thinking:
        "<thinking>User asked for 1st law. Provided definition and an example.</thinking>",
      references: [],
      timestamp: new Date(Date.now() - 3540000).toISOString(),
      source_pipeline: "mock_ollama_direct",
    },
    {
      id: "s1msg3",
      _id: "s1msg3",
      role: "user",
      parts: [
        { text: "What about its applications in aerospace engineering?" },
      ],
      timestamp: new Date(Date.now() - 3500000).toISOString(),
    },
    {
      id: "s1msg4",
      _id: "s1msg4",
      role: "model",
      parts: [
        {
          text: "Great question! In aerospace, it's fundamental for designing jet engines and rocket propulsion systems (analyzing thrust from energy conversion), understanding aerodynamic heating on re-entry vehicles, and managing thermal control systems for satellites and spacecraft to maintain operational temperatures in the vacuum of space. For instance, the energy balance for a jet engine directly applies this law [1].",
        },
      ],
      thinking:
        "<thinking>User asked for aerospace applications. Linked to engine design and thermal management. Added a mock reference.</thinking>",
      references: [
        {
          number: 1,
          source: "Aerospace_Thermo_Principles_Vol1.pdf",
          content_preview:
            "The first law is applied to calculate the energy changes as air and fuel pass through a jet engine, determining available thrust...",
        },
      ],
      timestamp: new Date(Date.now() - 3400000).toISOString(),
      source_pipeline: "mock_ollama_rag",
    },
  ],
  "dev-initial-session-appstate": [
    {
      id: "devmsg1",
      _id: "devmsg1",
      role: "user",
      parts: [
        { text: "Hi there, this is the initial dev session for UI testing!" },
      ],
      timestamp: new Date(Date.now() - 60000).toISOString(),
    },
    {
      id: "devmsg2",
      _id: "devmsg2",
      role: "model",
      parts: [
        {
          text: "Hello Dev User! Welcome to the UI testing environment. All systems are currently using mock data. Feel free to explore!",
        },
      ],
      thinking: null,
      references: [],
      timestamp: new Date().toISOString(),
      source_pipeline: "mock_gemini_direct",
    },
  ],
};

let MOCK_FILES_STORE = [
  {
    serverFilename: "doc-quantum-001.pdf",
    originalName: "Quantum_Entanglement_Intro.pdf",
    type: "application/pdf",
    size: 305800,
    lastModified: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    serverFilename: "doc-thermo-002.docx",
    originalName: "Aerospace_Thermo_Principles_Vol1.docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 150200,
    lastModified: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    serverFilename: "code-rocket-sim-003.py",
    originalName: "rocket_trajectory_sim.py",
    type: "text/x-python",
    size: 25700,
    lastModified: new Date(Date.now() - 86400000).toISOString(),
  },
];

let MOCK_ANALYSIS_RESULTS = {
  faq: {
    content:
      "## Mocked FAQs for Selected Document\n\n**Q1: What is this?**\nA1: A mock FAQ section.",
    thinking: "Generated mock FAQs.",
  },
  topics: {
    content: "### Mock Key Topics\n\n- Mock Topic Alpha\n- Mock Topic Beta",
    thinking: "Identified mock topics.",
  },
  mindmap: {
    content: `# Mocked Mindmap: Selected Document\n## Central Theme\n### Key Concept A\n### Key Concept B`,
    thinking: "Created mock mindmap structure.",
  },
};
// --- END OF MOCK DATA STORE ---

// --- Axios API Client (for real backend calls) ---
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api", // Default for development
});

apiClient.interceptors.request.use(
  (config) => {
    // Add JWT token to headers IF NOT IN MOCK MODE
    if (!DEV_MODE_MOCK_API) {
      const token = localStorage.getItem("authToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);
// --- End Axios API Client ---

// --- API Definition Object (Mock or Real) ---
const api = {
  // --- Auth ---
  login: async (credentials) => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay(400);
      console.log("MOCK API (V1): login attempt", credentials);
      const username = credentials.username || "DevUser"; // Use provided or default for mock
      const userToLogin = MOCK_USER_DATA_STORE["devUser001"] || {
        username: username,
        _id: `mock-id-${username}`,
      }; // Simplistic mock user
      const sessionId = `session-login-${Date.now()}`;
      if (!MOCK_CHAT_HISTORY_STORE) MOCK_CHAT_HISTORY_STORE = {}; // Defensive
      if (!MOCK_SESSIONS_STORE) MOCK_SESSIONS_STORE = {}; // Defensive
      MOCK_CHAT_HISTORY_STORE[sessionId] = [];
      MOCK_SESSIONS_STORE[sessionId] = {
        sessionId,
        updatedAt: new Date().toISOString(),
        messageCount: 0,
        preview: "New Session (Mock Login)",
      };
      return {
        token: `mock-token-for-${userToLogin.username}-${Date.now()}`, // Mock token
        username: userToLogin.username,
        _id: userToLogin._id,
        sessionId: sessionId,
      };
    }
    const response = await apiClient.post("/auth/signin", credentials);
    return response.data;
  },

  signup: async (userData) => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay(400);
      console.log("MOCK API (V1): signup attempt", userData);
      const sessionId = `session-signup-${Date.now()}`;
      if (!MOCK_CHAT_HISTORY_STORE) MOCK_CHAT_HISTORY_STORE = {}; // Defensive
      if (!MOCK_SESSIONS_STORE) MOCK_SESSIONS_STORE = {}; // Defensive
      MOCK_CHAT_HISTORY_STORE[sessionId] = [];
      MOCK_SESSIONS_STORE[sessionId] = {
        sessionId,
        updatedAt: new Date().toISOString(),
        messageCount: 0,
        preview: "New Session (Mock Signup)",
      };
      return {
        token: `mock-signup-token-${userData.username}-${Date.now()}`, // Mock token
        username: userData.username,
        _id: `mock-id-${userData.username}`, // Mock ID
        sessionId: sessionId,
      };
    }
    const response = await apiClient.post("/auth/signup", userData);
    return response.data;
  },

  getMe: async () => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay(100);
      const mockToken = localStorage.getItem("authToken");
      // Simulate /me based on AuthContext's DevUser or a generic one
      if (
        mockToken &&
        (mockToken.includes("mock-token-for-DevUser") ||
          mockToken.includes("mock-token-for-DevUI-User"))
      ) {
        return {
          _id: "devUser001",
          username: "DevUI-User",
          createdAt: new Date().toISOString(),
        };
      } else if (mockToken) {
        // Other mock token?
        try {
          const usernameFromToken =
            mockToken.split("-")[2] || "MockedUserFromToken";
          return {
            _id: `mock-id-${usernameFromToken}`,
            username: usernameFromToken,
            createdAt: new Date().toISOString(),
          };
        } catch (e) {
          /* ignore */
        }
      }
      // If no suitable mock token, reject as if unauthorized
      return Promise.reject({
        response: {
          status: 401,
          data: { message: "Mock: No valid token for /me" },
        },
      });
    }
    const response = await apiClient.get("/auth/me");
    return response.data;
  },

  // --- Chat ---
  sendMessage: async (payload) => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay(payload.useRag ? 800 : 400);
      console.log("MOCK API (V1): sendMessage", payload);
      const query = payload.query || "";
      const llmInUse = payload.llmProvider || "ollama";
      const systemP = payload.systemPrompt || "Default prompt.";
      const botText = payload.useRag
        ? `This is a MOCKED RAG response from ${llmInUse.toUpperCase()} for: "${query.substring(
            0,
            25
          )}...". Considering your system prompt for a "${systemP.substring(
            0,
            20
          )}..." style, document [1] offers insights.`
        : `This is a MOCK direct response from ${llmInUse.toUpperCase()} for: "${query.substring(
            0,
            25
          )}...". Your system prompt mode: "${systemP.substring(0, 20)}...".`;
      const thinking = payload.useRag
        ? `<thinking>Query: "${query.substring(
            0,
            15
          )}..."\nLLM: ${llmInUse.toUpperCase()} (RAG)\nSystem Prompt: "${systemP.substring(
            0,
            30
          )}..."\n(Mock) Found context in '${
            MOCK_FILES_STORE[0]?.originalName || "mock_doc.pdf"
          }'.</thinking>`
        : `<thinking>Query: "${query.substring(
            0,
            15
          )}..."\nLLM: ${llmInUse.toUpperCase()} (Direct)\nSystem Prompt: "${systemP.substring(
            0,
            30
          )}..."\n(Mock) Processing direct query.</thinking>`;
      const references = payload.useRag
        ? [
            {
              number: 1,
              source: MOCK_FILES_STORE[0]?.originalName || "default_mock.pdf",
              content_preview:
                "This is a snippet from the relevant mock document related to your query...",
            },
          ]
        : [];
      const botMsg = {
        id: `bot-${Date.now()}`,
        role: "model",
        parts: [{ text: botText }],
        thinking,
        references,
        timestamp: new Date().toISOString(),
        source_pipeline: payload.useRag
          ? `mock_${llmInUse}_rag`
          : `mock_${llmInUse}_direct`,
      };
      if (payload.sessionId) {
        if (!MOCK_CHAT_HISTORY_STORE[payload.sessionId])
          MOCK_CHAT_HISTORY_STORE[payload.sessionId] = [];
        MOCK_CHAT_HISTORY_STORE[payload.sessionId].push(botMsg);
        if (MOCK_SESSIONS_STORE[payload.sessionId]) {
          MOCK_SESSIONS_STORE[payload.sessionId].messageCount =
            (MOCK_SESSIONS_STORE[payload.sessionId].messageCount || 0) + 2;
          MOCK_SESSIONS_STORE[payload.sessionId].updatedAt =
            new Date().toISOString();
          MOCK_SESSIONS_STORE[payload.sessionId].preview =
            botText.substring(0, 50) + "...";
        }
      }
      return {
        reply: botMsg,
        sessionId: payload.sessionId,
        source_pipeline: botMsg.source_pipeline,
      };
    }
    const response = await apiClient.post("/chat/message", payload);
    return response.data;
  },

  getChatHistory: async (sessionId) => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay(150);
      console.log("MOCK API (V1): getChatHistory for", sessionId);
      if (!MOCK_CHAT_HISTORY_STORE) MOCK_CHAT_HISTORY_STORE = {}; // Defensive
      return MOCK_CHAT_HISTORY_STORE[sessionId] || [];
    }
    // Real backend requires sessionId in the path for GET
    const response = await apiClient.get(`/chat/session/${sessionId}`);
    return response.data.messages || []; // Adapt if backend returns full session
  },

  getChatSessions: async () => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay(150);
      console.log("MOCK API (V1): getChatSessions");
      if (!MOCK_SESSIONS_STORE) MOCK_SESSIONS_STORE = {}; // Defensive
      return Object.values(MOCK_SESSIONS_STORE).sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      );
    }
    const response = await apiClient.get("/chat/sessions");
    return response.data;
  },

  startNewSession: async () => {
    // For V1, this just creates a mock session ID
    if (DEV_MODE_MOCK_API) {
      await mockDelay(50);
      const newSid = `session-mock-new-${Date.now()}`;
      if (!MOCK_CHAT_HISTORY_STORE) MOCK_CHAT_HISTORY_STORE = {}; // Defensive
      if (!MOCK_SESSIONS_STORE) MOCK_SESSIONS_STORE = {}; // Defensive
      MOCK_CHAT_HISTORY_STORE[newSid] = [];
      MOCK_SESSIONS_STORE[newSid] = {
        sessionId: newSid,
        updatedAt: new Date().toISOString(),
        messageCount: 0,
        preview: "Newly Started Mock Session",
      };
      console.log("MOCK API (V1): startNewSession, created:", newSid);
      return { sessionId: newSid };
    }
    // Real backend might have a dedicated endpoint or frontend generates a UUID for new sessions
    // For now, assuming frontend generates a new UUID and this is used in App.jsx
    // If backend needs to create it:
    // const response = await apiClient.post('/chat/new_session'); return response.data;
    // For this integration, let's assume the frontend handles new session ID generation or
    // the backend's /auth/signin or /auth/signup provides the initial sessionId.
    // If strictly "start new chat" *after* login means a new ID from backend:
    console.warn(
      "api.startNewSession: Real backend call for starting a new session explicitly not yet defined, ensure backend handles this or frontend generates new UUIDs for sessions."
    );
    const newSid = `client-generated-session-${Date.now()}`; // Placeholder for client-side generation
    return { sessionId: newSid };
  },

  saveChatHistory: async (sessionId, messages) => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay(100);
      console.log(
        `MOCK API: Saving history for session ${sessionId}, ${messages.length} messages`
      );
      if (!MOCK_CHAT_HISTORY_STORE) MOCK_CHAT_HISTORY_STORE = {};
      MOCK_CHAT_HISTORY_STORE[sessionId] = messages.map((m) => ({ ...m })); // Save a copy

      if (!MOCK_SESSIONS_STORE) MOCK_SESSIONS_STORE = {};
      if (MOCK_SESSIONS_STORE[sessionId]) {
        MOCK_SESSIONS_STORE[sessionId].messageCount = messages.length;
        MOCK_SESSIONS_STORE[sessionId].updatedAt = new Date().toISOString();
        MOCK_SESSIONS_STORE[sessionId].preview =
          messages[0]?.parts?.[0]?.text.substring(0, 50) + "..." ||
          "Chat Session";
      } else if (messages.length > 0) {
        MOCK_SESSIONS_STORE[sessionId] = {
          sessionId: sessionId,
          updatedAt: new Date().toISOString(),
          messageCount: messages.length,
          preview:
            messages[0]?.parts?.[0]?.text.substring(0, 50) + "..." ||
            "Chat Session",
        };
      }
      const newClientSessionId = `session-mock-new-${Date.now()}`;
      return {
        message: "Mock history saved.",
        savedSessionId: sessionId,
        newSessionId: newClientSessionId,
      };
    }
    const response = await apiClient.post("/chat/history", {
      sessionId,
      messages,
    });
    return response.data;
  },

  // --- Files ---
  uploadFile: async (formData, onUploadProgress) => {
    if (DEV_MODE_MOCK_API) {
      const file = formData.get("file");
      const mockFileName = file?.name || "mock_upload.pdf";
      console.log("MOCK API (V1): uploadFile", mockFileName);
      if (onUploadProgress) {
        let p = 0;
        const i = setInterval(() => {
          p += 25;
          onUploadProgress({ loaded: p, total: 100 });
          if (p >= 100) clearInterval(i);
        }, 80);
      }
      await mockDelay(400);
      const newFileEntry = {
        serverFilename: `mock-server-${Date.now()}-${mockFileName}`,
        originalName: mockFileName,
        type: file?.type || "application/octet-stream",
        size: file?.size || Math.floor(Math.random() * 100000),
        lastModified: new Date().toISOString(),
      };
      if (!MOCK_FILES_STORE) MOCK_FILES_STORE = []; // Defensive
      MOCK_FILES_STORE.unshift(newFileEntry);
      return {
        message: `${mockFileName} uploaded (mocked)!`,
        filename: newFileEntry.serverFilename,
        originalname: newFileEntry.originalName,
      };
    }
    const response = await apiClient.post("/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    });
    return response.data;
  },

  getFiles: async () => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay(100);
      console.log("MOCK API (V1): getFiles");
      if (!MOCK_FILES_STORE) MOCK_FILES_STORE = []; // Defensive
      return [...MOCK_FILES_STORE];
    }
    const response = await apiClient.get("/files");
    return response.data;
  },

  renameFile: async (serverFilename, newOriginalName) => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay();
      console.log(
        "MOCK API (V1): renameFile",
        serverFilename,
        "to",
        newOriginalName
      );
      if (!MOCK_FILES_STORE) MOCK_FILES_STORE = []; // Defensive
      const file = MOCK_FILES_STORE.find(
        (f) => f.serverFilename === serverFilename
      );
      if (file) file.originalName = newOriginalName;
      return { message: "File renamed (mocked)" };
    }
    const response = await apiClient.patch(`/files/${serverFilename}`, {
      newOriginalName,
    });
    return response.data;
  },

  deleteFile: async (serverFilename) => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay();
      console.log("MOCK API (V1): deleteFile", serverFilename);
      if (!MOCK_FILES_STORE) MOCK_FILES_STORE = []; // Defensive
      MOCK_FILES_STORE = MOCK_FILES_STORE.filter(
        (f) => f.serverFilename !== serverFilename
      );
      return { message: "File deleted (mocked)" };
    }
    const response = await apiClient.delete(`/files/${serverFilename}`);
    return response.data;
  },

  // --- Analysis ---
  requestAnalysis: async (payload) => {
    // payload: { filename (original), analysis_type }
    if (DEV_MODE_MOCK_API) {
      await mockDelay(payload.analysis_type === "mindmap" ? 1200 : 600);
      console.log("MOCK API (V1): requestAnalysis", payload);
      if (!MOCK_ANALYSIS_RESULTS) MOCK_ANALYSIS_RESULTS = {}; // Defensive
      const result = MOCK_ANALYSIS_RESULTS[payload.analysis_type] || {
        content: `No mock data for ${payload.analysis_type} on ${payload.filename}`,
        thinking: "Used fallback.",
      };
      return {
        ...result,
        content: result.content.replace(
          "Selected Document",
          payload.filename || "the Document"
        ),
      };
    }
    // Real backend needs to be implemented for analysis
    // For now, this will likely fail or use a non-existent endpoint
    // const response = await apiClient.post('/analysis/document', payload); return response.data;
    console.warn(
      "api.requestAnalysis: Real backend endpoint for analysis not yet defined."
    );
    // Fallback to mock even if DEV_MODE_MOCK_API is false, until backend is ready
    await mockDelay(payload.analysis_type === "mindmap" ? 1200 : 600);
    const result = MOCK_ANALYSIS_RESULTS[payload.analysis_type] || {
      content: `No mock data for ${payload.analysis_type} on ${payload.filename}`,
      thinking: "Used fallback (real endpoint pending).",
    };
    return {
      ...result,
      content: result.content.replace(
        "Selected Document",
        payload.filename || "the Document"
      ),
    };
  },

  // --- User LLM Config ---
  updateUserLLMConfig: async (configData) => {
    // { llmProvider, apiKey?, ollamaUrl? }
    if (DEV_MODE_MOCK_API) {
      await mockDelay();
      console.log("MOCK API (V1): updateUserLLMConfig", configData);
      localStorage.setItem("mockUserLLMPreference", configData.llmProvider);
      if (configData.llmProvider === "gemini" && configData.apiKey)
        localStorage.setItem(
          "mockUserGeminiKeyStatus_V1",
          "ProvidedDuringMock"
        );
      if (configData.llmProvider === "ollama" && configData.ollamaUrl)
        localStorage.setItem("mockUserOllamaUrl_V1", configData.ollamaUrl);
      return { message: `LLM preference updated (mocked).` };
    }
    // Backend endpoint for this needs to be implemented.
    // For now, mock success
    // const response = await apiClient.post('/user/config/llm', configData); return response.data;
    console.warn(
      "api.updateUserLLMConfig: Real backend endpoint for LLM config not yet defined."
    );
    return {
      message: `LLM preference update noted locally (real endpoint pending).`,
    };
  },

  getUserLLMConfig: async () => {
    // Expects { llmProvider }
    if (DEV_MODE_MOCK_API) {
      await mockDelay();
      const llmProvider =
        localStorage.getItem("mockUserLLMPreference") || "ollama";
      console.log("MOCK API (V1): getUserLLMConfig, returning:", llmProvider);
      return { llmProvider };
    }
    // Backend endpoint for this needs to be implemented.
    // For now, mock success
    // const response = await apiClient.get('/user/config/llm'); return response.data;
    console.warn(
      "api.getUserLLMConfig: Real backend endpoint for LLM config not yet defined."
    );
    return { llmProvider: localStorage.getItem("selectedLLM") || "ollama" }; // Return local preference
  },

  // --- Status & Syllabus ---
  getOrchestratorStatus: async () => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay(50);
      return {
        status: "ok",
        message: "Backend (Mocked & Online)",
        database_status: "Connected (Mock)",
      };
    }
    // If your Node.js backend has a health endpoint (e.g., GET /api/health)
    // This is different from the Python RAG service health.
    // For now, assume Node.js backend is okay if this function is called.
    // const response = await apiClient.get('/health'); // Example
    // return response.data;
    return {
      status: "ok",
      message: "Node.js Backend (Assumed OK)",
      database_status: "Connected (Assumed)",
    };
  },

  getSyllabus: async (subjectId) => {
    if (DEV_MODE_MOCK_API) {
      await mockDelay();
      console.log("MOCK API (V1): getSyllabus for", subjectId);
      return `# Mock Syllabus: ${subjectId}\n\n- Section 1: Intro to ${subjectId}\n- Section 2: Core Principles`;
    }
    const response = await apiClient.get(`/syllabus/${subjectId}`);
    // Assuming backend returns { syllabus: "markdown_content" }
    return response.data.syllabus;
  },
};

export default api;
