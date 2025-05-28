// // frontend/src/services/api.js (Version 1 - Testing/Development with Static Mocks)

// // This flag is central to this version. All functions will return mock data.
// const DEV_MODE_MOCK_API = true; 

// const mockDelay = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms)); // Shorter delay for faster UI testing

// // --- MOCK DATA STORE ---
// const MOCK_CURRENT_USER = {
//     _id: 'devUser001',
//     username: 'DevUI-User',
//     // Any other user details your UI might display from a /me endpoint (if you had one)
// };

// let MOCK_SESSIONS_STORE = {
//     'session-mock-1': { 
//         sessionId: 'session-mock-1', 
//         updatedAt: new Date(Date.now() - 3600000).toISOString(), 
//         messageCount: 4, 
//         preview: "Conversation about thermodynamics and its applications..." 
//     },
//     'session-mock-2': { 
//         sessionId: 'session-mock-2', 
//         updatedAt: new Date(Date.now() - 7200000).toISOString(), 
//         messageCount: 6, 
//         preview: "Exploring quantum entanglement and its implications for computing..." 
//     },
//     'dev-initial-session-appstate': { // Matches AppStateContext default
//         sessionId: 'dev-initial-session-appstate', 
//         updatedAt: new Date().toISOString(), 
//         messageCount: 2, 
//         preview: "Initial development session with UI focus..."
//     }
// };

// let MOCK_CHAT_HISTORY_STORE = {
//     'session-mock-1': [
//         { _id: 'msg1-1', role: 'user', parts: [{text: "Hello AI tutor! Can you explain the first law of thermodynamics?"}], timestamp: new Date(Date.now() - 3550000).toISOString() },
//         { _id: 'msg1-2', role: 'model', parts: [{text: "Certainly! The first law of thermodynamics, also known as the law of conservation of energy, states that energy cannot be created or destroyed in an isolated system. It can only be transformed from one form to another. \n\nFor example, in a heat engine, chemical energy in fuel is converted into thermal energy, which is then converted into mechanical work."}], thinking: "<thinking>User asked for 1st law. Provided definition and an example.</thinking>", references: [], timestamp: new Date(Date.now() - 3540000).toISOString(), source_pipeline: 'mock_ollama_direct'},
//         { _id: 'msg1-3', role: 'user', parts: [{text: "What about its applications in aerospace engineering?"}], timestamp: new Date(Date.now() - 3500000).toISOString() },
//         { _id: 'msg1-4', role: 'model', parts: [{text: "Great question! In aerospace, it's fundamental for designing jet engines and rocket propulsion systems, analyzing aerodynamic heating, and managing thermal control systems for spacecraft. For instance, understanding energy conversion is key to optimizing engine efficiency [1]."}], thinking: "<thinking>User asked for aerospace applications. Linked to engine design and thermal management. Added a mock reference.</thinking>", references: [{number: 1, source: "Aerospace_Thermo_Principles.pdf", content_preview:"Optimizing jet engine thrust requires careful application of thermodynamic laws..."}], timestamp: new Date(Date.now() - 3400000).toISOString(), source_pipeline: 'mock_ollama_rag'},
//     ],
//     'session-mock-2': [
//         { _id: 'msg2-1', role: 'user', parts: [{text: "Explain quantum entanglement simply."}], timestamp: new Date(Date.now() - 7100000).toISOString() },
//         { _id: 'msg2-2', role: 'model', parts: [{text: "Imagine two coins that are intrinsically linked. If you flip one and observe 'heads', you instantly know the other coin, no matter how far away, will show 'tails' (if they were set up to be opposite). Quantum entanglement is a similar phenomenon where particles become interconnected, and the state of one particle instantly influences the state of the other(s), regardless of the distance separating them. It's a cornerstone of quantum mechanics!"}], thinking: null, references: [], timestamp: new Date(Date.now() - 7000000).toISOString(), source_pipeline: 'mock_gemini_direct'},
//         // ... more messages for session-mock-2
//     ],
//     'dev-initial-session-appstate': [ // Corresponds to AppStateContext initial dev session
//         { _id: 'devmsg1', role: 'user', parts: [{text: "Hi there, this is the initial dev session!"}], timestamp: new Date(Date.now() - 60000).toISOString() },
//         { _id: 'devmsg2', role: 'model', parts: [{text: "Hello Dev User! This is a mocked response for the initial session. The UI looks great!"}], thinking: null, references: [], timestamp: new Date().toISOString(), source_pipeline: 'mock_gemini_direct'},
//     ]
// };

// let MOCK_FILES_STORE_STATIC = [
//     { serverFilename: 'doc-physics-001.pdf', originalName: 'Quantum_Basics.pdf', type: 'application/pdf', size: 204800, lastModified: new Date(Date.now() - 86400000 * 2).toISOString() },
//     { serverFilename: 'doc-eng-002.docx', originalName: 'Thermodynamics_Notes.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 120500, lastModified: new Date(Date.now() - 86400000).toISOString() },
//     { serverFilename: 'code-python-003.py', originalName: 'simulation_script.py', type: 'text/x-python', size: 15300, lastModified: new Date().toISOString() },
// ];

// const MOCK_ANALYSIS_RESULTS = {
//     faq: {
//         content: "## Frequently Asked Questions (Mocked)\n\n**Q1: What is the main topic of this document?**\nA1: This document primarily discusses [mocked main topic] and its implications in [mocked field].\n\n**Q2: What are the key takeaways?**\nA2: Key takeaways include [mocked takeaway 1], [mocked takeaway 2], and the importance of [mocked concept].\n\n**Q3: Are there any examples provided?**\nA3: Yes, the document illustrates [mocked example scenario] to explain [another mocked concept].",
//         thinking: "<thinking>Generated mock FAQs based on the document's title and a generic structure.</thinking>"
//     },
//     topics: {
//         content: "### Key Topics Extracted (Mocked)\n\n- **Mock Topic A:** Detailed discussion on the foundational principles.\n- **Mock Topic B:** Practical applications and case studies (simulated).\n- **Mock Topic C:** Future research directions and challenges.",
//         thinking: "<thinking>Identified common patterns for topic extraction and populated with placeholder content.</thinking>"
//     },
//     mindmap: {
//         content: `# Mocked Mindmap: Document Title\n## Core Concept\n### Sub-Concept 1\n- Detail 1.A\n- Detail 1.B\n### Sub-Concept 2\n- Detail 2.A\n- Detail 2.B\n## Applications\n### Industry A\n### Research Area B\n## Challenges\n- Limitation X\n- Constraint Y`,
//         thinking: "<thinking>Created a hierarchical Markdown structure suitable for Markmap rendering, using generic terms.</thinking>"
//     }
// };

// const api = {
//     // --- Auth ---
//     login: async (credentials) => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for login");
//         await mockDelay(500);
//         console.log("MOCK API (V1): login", credentials);
//         const userToLogin = MOCK_USER_DATA['devUser001'];
//         const sessionId = `session-login-${Date.now()}`;
//         MOCK_CHAT_HISTORY_STORE[sessionId] = []; // Initialize history for new session
//         MOCK_SESSIONS_STORE[sessionId] = { sessionId, updatedAt: new Date().toISOString(), messageCount: 0, preview: "New Login Session" };
//         return { 
//             token: `mock-token-${userToLogin.username}-${Date.now()}`, 
//             username: userToLogin.username, 
//             _id: userToLogin._id, 
//             sessionId: sessionId
//         };
//     },
//     signup: async (userData) => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for signup");
//         await mockDelay(500);
//         console.log("MOCK API (V1): signup", userData);
//         const userToLogin = MOCK_USER_DATA['devUser001']; // Sign up as the main mock user
//         const sessionId = `session-signup-${Date.now()}`;
//         MOCK_CHAT_HISTORY_STORE[sessionId] = [];
//         MOCK_SESSIONS_STORE[sessionId] = { sessionId, updatedAt: new Date().toISOString(), messageCount: 0, preview: "New Signup Session" };
//         return { 
//             token: `mock-signup-token-${userToLogin.username}-${Date.now()}`, 
//             username: userToLogin.username, 
//             _id: userToLogin._id, 
//             sessionId: sessionId
//         };
//     },

//     // --- Chat ---
//     sendMessage: async (payload) => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for sendMessage");
//         await mockDelay(payload.useRag ? 1000 : 500);
//         console.log("MOCK API (V1): sendMessage", payload);

//         const query = payload.query || "";
//         const llmInUse = payload.llmProvider || 'ollama'; // From AppStateContext via CenterPanel
//         const systemP = payload.systemPrompt || "Default system prompt in use.";

//         const botText = payload.useRag 
//             ? `This is a MOCKED RAG response from ${llmInUse.toUpperCase()} for: "${query.substring(0,25)}...". Based on your document [1] and system prompt starting with "${systemP.substring(0,20)}...". It seems important.`
//             : `This is a MOCK direct response from ${llmInUse.toUpperCase()} for: "${query.substring(0,25)}...". System prompt started with "${systemP.substring(0,20)}...".`;
        
//         const thinking = payload.useRag 
//             ? `<thinking>Query: "${query.substring(0,15)}..."\nLLM: ${llmInUse.toUpperCase()} (RAG)\nSystem Prompt: "${systemP.substring(0,30)}..."\n(Mock) Doc search -> Found relevant info. Synthesizing...</thinking>` 
//             : `<thinking>Query: "${query.substring(0,15)}..."\nLLM: ${llmInUse.toUpperCase()} (Direct)\nSystem Prompt: "${systemP.substring(0,30)}..."\n(Mock) Processing direct query.</thinking>`;
        
//         const references = payload.useRag 
//             ? [{ number: 1, source: MOCK_FILES_STORE_STATIC[0]?.originalName || "mock_source.pdf", content_preview: "This is a snippet from the relevant mock document related to your query..."}] 
//             : [];
        
//         const botMsg = { 
//             id: `bot-${Date.now()}-${Math.random().toString(16).slice(2)}`,
//             role: 'model', 
//             parts: [{text: botText }], 
//             thinking, 
//             references,
//             timestamp: new Date().toISOString(),
//             source_pipeline: payload.useRag ? `mock_${llmInUse}_rag` : `mock_${llmInUse}_direct`
//         };
        
//         // Add to mock history store if session exists
//         if (payload.sessionId) {
//             if (!MOCK_CHAT_HISTORY_STORE[payload.sessionId]) {
//                 MOCK_CHAT_HISTORY_STORE[payload.sessionId] = [];
//             }
//             // Don't add user message here, App.jsx/CenterPanel does it to local state for immediate UI
//             MOCK_CHAT_HISTORY_STORE[payload.sessionId].push(botMsg); // Only add bot message to persistent mock
//             // Update session list
//             if(MOCK_SESSIONS_STORE[payload.sessionId]) {
//                 MOCK_SESSIONS_STORE[payload.sessionId].messageCount = MOCK_CHAT_HISTORY_STORE[payload.sessionId].length;
//                 MOCK_SESSIONS_STORE[payload.sessionId].updatedAt = new Date().toISOString();
//                 MOCK_SESSIONS_STORE[payload.sessionId].preview = botText.substring(0,50) + "...";
//             }
//         }
//         return { reply: botMsg, sessionId: payload.sessionId, source_pipeline: botMsg.source_pipeline };
//     },
//     getChatHistory: async (sessionId) => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for getChatHistory");
//         await mockDelay();
//         console.log("MOCK API (V1): getChatHistory for session", sessionId);
//         return MOCKED_CHAT_HISTORY_STORE[sessionId] || [];
//     },
//     getChatSessions: async () => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for getChatSessions");
//         await mockDelay();
//         console.log("MOCK API (V1): getChatSessions");
//         return Object.values(MOCK_SESSIONS_STORE).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
//     },
//     startNewSession: async () => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for startNewSession");
//         await mockDelay();
//         const newSid = `session-mock-${Date.now()}`;
//         MOCK_CHAT_HISTORY_STORE[newSid] = [];
//         MOCK_SESSIONS_STORE[newSid] = { sessionId: newSid, updatedAt: new Date().toISOString(), messageCount: 0, preview: "New Chat Session (Mock)" };
//         console.log("MOCK API (V1): startNewSession, created:", newSid);
//         return { sessionId: newSid };
//     },

//     // --- Files ---
//     uploadFile: async (formData, onUploadProgress) => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for uploadFile");
//         const file = formData.get('file');
//         const mockFileName = file?.name || 'mock_upload.pdf';
//         console.log("MOCK API (V1): uploadFile", mockFileName);
        
//         if (onUploadProgress) { /* simulate progress */
//             let p=0; const i=setInterval(()=>{p+=20; onUploadProgress({loaded:p,total:100}); if(p>=100) clearInterval(i);},100);
//         }
//         await mockDelay(600);
//         const newFileEntry = { 
//             serverFilename: `mock-server-${Date.now()}-${mockFileName}`, 
//             originalName: mockFileName, 
//             type: file?.type || 'application/octet-stream', 
//             size: file?.size || 12345, 
//             lastModified: new Date().toISOString() 
//         };
//         MOCK_FILES_STORE_STATIC.unshift(newFileEntry); // Add to top of list
//         return { message: `${mockFileName} uploaded (mocked)! Processing initiated.`, filename: newFileEntry.serverFilename, originalname: newFileEntry.originalName };
//     },
//     getFiles: async () => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for getFiles");
//         await mockDelay();
//         console.log("MOCK API (V1): getFiles");
//         return [...MOCK_FILES_STORE_STATIC]; // Return a copy
//     },
//     renameFile: async (serverFilename, newOriginalName) => {
//          if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for renameFile");
//          await mockDelay();
//          console.log("MOCK API (V1): renameFile", serverFilename, "to", newOriginalName);
//          const file = MOCK_FILES_STORE_STATIC.find(f => f.serverFilename === serverFilename);
//          if (file) file.originalName = newOriginalName;
//          return { message: "File renamed (mocked)" };
//     },
//     deleteFile: async (serverFilename) => {
//          if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for deleteFile");
//          await mockDelay();
//          console.log("MOCK API (V1): deleteFile", serverFilename);
//          MOCK_FILES_STORE_STATIC = MOCK_FILES_STORE_STATIC.filter(f => f.serverFilename !== serverFilename);
//          return { message: "File deleted (mocked)" };
//     },

//     // --- Analysis ---
//     requestAnalysis: async (payload) => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for requestAnalysis");
//         await mockDelay(payload.analysis_type === 'mindmap' ? 1500 : 800);
//         console.log("MOCK API (V1): requestAnalysis", payload);
//         const result = MOCK_ANALYSIS_RESULTS[payload.analysis_type] || { content: `No mock data for ${payload.analysis_type} on ${payload.filename}`, thinking: "Used fallback."};
//         return { ...result, content: result.content.replace("Document Title", payload.filename || "Selected Document") };
//     },
    
//     // --- User LLM Config ---
//     updateUserLLMConfig: async (configData) => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for updateUserLLMConfig");
//         await mockDelay(); 
//         console.log("MOCK API (V1): updateUserLLMConfig", configData);
//         // Simulate saving preference (e.g., to localStorage for mock persistence)
//         localStorage.setItem('mockUserLLMPreference', configData.llmProvider);
//         if(configData.llmProvider === 'gemini' && configData.apiKey) {
//             localStorage.setItem('mockUserGeminiKeyStatus', 'Provided (Mock)');
//         }
//         return { message: `LLM preference updated to ${configData.llmProvider} (mocked).` };
//     },
//     getUserLLMConfig: async () => {
//          if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for getUserLLMConfig");
//          await mockDelay();
//          const llmProvider = localStorage.getItem('mockUserLLMPreference') || 'ollama';
//          console.log("MOCK API (V1): getUserLLMConfig, returning:", llmProvider);
//          return { llmProvider }; // Only return provider, not API key
//     },

//     // --- Status & Syllabus ---
//     getOrchestratorStatus: async () => {
//         if (!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for getOrchestratorStatus");
//         await mockDelay(100);
//         return { status: "ok", message: "Backend (Mocked & Healthy)", database_status: "Connected" };
//     },
//     getSyllabus: async (subjectId) => {
//         if(!DEV_MODE_MOCK_API) throw new Error("Mock API disabled for getSyllabus");
//         await mockDelay();
//         console.log("MOCK API (V1): getSyllabus", subjectId);
//         return `# Mock Syllabus: ${subjectId.replace("_"," ")}\n\n- Topic 1: Introduction to ${subjectId}\n- Topic 2: Core Principles\n- Topic 3: Advanced Applications`;
//     }
// };

// export default api;
// // No need to export apiClient in this fully mocked version if it's not used by real calls.
// // export { apiClient }; 









// frontend/src/services/api.js (Version 1 - UI Testing with Full Mocks)
import axios from 'axios'; // Keep for V2 structure, not used by V1 mocks directly

const DEV_MODE_MOCK_API = true; 

const mockDelay = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

// --- MOCK DATA STORE - Ensure these are defined AT THE TOP LEVEL of this module ---
const MOCK_USER_DATA_STORE = { 
    'devUser001': { username: 'DevUI-User', _id: 'devUser001' }
};

let MOCK_SESSIONS_STORE = { // Renamed to avoid conflict if you copy-pasted with _API suffix
    'session-mock-1': { sessionId: 'session-mock-1', updatedAt: new Date(Date.now() - 3600000).toISOString(), messageCount: 4, preview: "Thermodynamics basics and applications..." },
    'session-mock-2': { sessionId: 'session-mock-2', updatedAt: new Date(Date.now() - 7200000).toISOString(), messageCount: 6, preview: "Exploring quantum entanglement simply..." },
    'dev-initial-session-appstate': { sessionId: 'dev-initial-session-appstate', updatedAt: new Date().toISOString(), messageCount: 2, preview: "Initial development session for UI testing..." }
};

let MOCK_CHAT_HISTORY_STORE = { // Renamed
    'session-mock-1': [
        { id: 's1msg1', _id: 's1msg1', role: 'user', parts: [{text: "Hello AI tutor! Can you explain the first law of thermodynamics?"}], timestamp: new Date(Date.now() - 3550000).toISOString() },
        { id: 's1msg2', _id: 's1msg2', role: 'model', parts: [{text: "Certainly! The first law of thermodynamics, also known as the law of conservation of energy, states that energy cannot be created or destroyed in an isolated system. It can only be transformed from one form to another. \n\nFor example, in a heat engine, chemical energy in fuel is converted into thermal energy, which is then converted into mechanical work."}], thinking: "<thinking>User asked for 1st law. Provided definition and an example.</thinking>", references: [], timestamp: new Date(Date.now() - 3540000).toISOString(), source_pipeline: 'mock_ollama_direct'},
        { id: 's1msg3', _id: 's1msg3', role: 'user', parts: [{text: "What about its applications in aerospace engineering?"}], timestamp: new Date(Date.now() - 3500000).toISOString() },
        { id: 's1msg4', _id: 's1msg4', role: 'model', parts: [{text: "Great question! In aerospace, it's fundamental for designing jet engines and rocket propulsion systems (analyzing thrust from energy conversion), understanding aerodynamic heating on re-entry vehicles, and managing thermal control systems for satellites and spacecraft to maintain operational temperatures in the vacuum of space. For instance, the energy balance for a jet engine directly applies this law [1]."}], thinking: "<thinking>User asked for aerospace applications. Linked to engine design and thermal management. Added a mock reference.</thinking>", references: [{number: 1, source: "Aerospace_Thermo_Principles_Vol1.pdf", content_preview:"The first law is applied to calculate the energy changes as air and fuel pass through a jet engine, determining available thrust..."}], timestamp: new Date(Date.now() - 3400000).toISOString(), source_pipeline: 'mock_ollama_rag'},
    ],
    'dev-initial-session-appstate': [
        { id: 'devmsg1', _id: 'devmsg1', role: 'user', parts: [{text: "Hi there, this is the initial dev session for UI testing!"}], timestamp: new Date(Date.now() - 60000).toISOString() },
        { id: 'devmsg2', _id: 'devmsg2', role: 'model', parts: [{text: "Hello Dev User! Welcome to the UI testing environment. All systems are currently using mock data. Feel free to explore!"}], thinking: null, references: [], timestamp: new Date().toISOString(), source_pipeline: 'mock_gemini_direct'},
    ]
};

let MOCK_FILES_STORE = [ // Renamed
    { serverFilename: 'doc-quantum-001.pdf', originalName: 'Quantum_Entanglement_Intro.pdf', type: 'application/pdf', size: 305800, lastModified: new Date(Date.now() - 86400000 * 3).toISOString() },
    { serverFilename: 'doc-thermo-002.docx', originalName: 'Aerospace_Thermo_Principles_Vol1.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 150200, lastModified: new Date(Date.now() - 86400000 * 2).toISOString() },
    { serverFilename: 'code-rocket-sim-003.py', originalName: 'rocket_trajectory_sim.py', type: 'text/x-python', size: 25700, lastModified: new Date(Date.now() - 86400000).toISOString() },
];

let MOCK_ANALYSIS_RESULTS = { // Renamed
    faq: { content: "## Mocked FAQs for Selected Document\n\n**Q1: What is this?**\nA1: A mock FAQ section.", thinking: "Generated mock FAQs." },
    topics: { content: "### Mock Key Topics\n\n- Mock Topic Alpha\n- Mock Topic Beta", thinking: "Identified mock topics." },
    mindmap: { content: `# Mocked Mindmap: Selected Document\n## Central Theme\n### Key Concept A\n### Key Concept B`, thinking: "Created mock mindmap structure." }
};
// --- END OF MOCK DATA STORE ---


const apiClient = axios.create({ // This is for V2
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api',
});
apiClient.interceptors.request.use(config => { /* ... as before ... */ });


const api = {
    login: async (credentials) => {
        if (DEV_MODE_MOCK_API) {
            await mockDelay(400); 
            console.log("MOCK API (V1): login attempt", credentials);
            const username = credentials.username || 'DevUser';
            const userToLogin = MOCK_USER_DATA_STORE['devUser001'] || { username: username, _id: `mock-id-${username}` };
            
            const sessionId = `session-login-${Date.now()}`;
            
            // Initialize stores if they were somehow cleared (shouldn't happen at module scope but defensive)
            if (!MOCK_CHAT_HISTORY_STORE) MOCK_CHAT_HISTORY_STORE = {};
            if (!MOCK_SESSIONS_STORE) MOCK_SESSIONS_STORE = {};

            MOCK_CHAT_HISTORY_STORE[sessionId] = []; 
            MOCK_SESSIONS_STORE[sessionId] = { 
                sessionId, 
                updatedAt: new Date().toISOString(), 
                messageCount: 0, 
                preview: "New Session (Mock Login)" 
            };
            
            return { 
                token: `mock-token-for-${userToLogin.username}-${Date.now()}`, 
                username: userToLogin.username, 
                _id: userToLogin._id, 
                sessionId: sessionId
            };
        }
        // Real call for V2
        const response = await apiClient.post('/auth/signin', credentials);
        return response.data;
    },

    signup: async (userData) => {
        if (DEV_MODE_MOCK_API) {
            await mockDelay(400);
            console.log("MOCK API (V1): signup attempt", userData);
            const sessionId = `session-signup-${Date.now()}`;

            if (!MOCK_CHAT_HISTORY_STORE) MOCK_CHAT_HISTORY_STORE = {};
            if (!MOCK_SESSIONS_STORE) MOCK_SESSIONS_STORE = {};

            MOCK_CHAT_HISTORY_STORE[sessionId] = [];
            MOCK_SESSIONS_STORE[sessionId] = { sessionId, updatedAt: new Date().toISOString(), messageCount: 0, preview: "New Session (Mock Signup)" };
            return { 
                token: `mock-signup-token-${userData.username}-${Date.now()}`, 
                username: userData.username, 
                _id: `mock-id-${userData.username}`, 
                sessionId: sessionId 
            };
        }
        const response = await apiClient.post('/auth/signup', userData);
        return response.data;
    },

    sendMessage: async (payload) => {
        if (DEV_MODE_MOCK_API) {
            await mockDelay(payload.useRag ? 800 : 400); console.log("MOCK API (V1): sendMessage", payload);
            const query = payload.query || ""; const llmInUse = payload.llmProvider || 'ollama'; const systemP = payload.systemPrompt || "Default prompt.";
            const botText = payload.useRag 
                ? `This is a MOCKED RAG response from ${llmInUse.toUpperCase()} for: "${query.substring(0,25)}...". Considering your system prompt for a "${systemP.substring(0,20)}..." style, document [1] offers insights.`
                : `This is a MOCK direct response from ${llmInUse.toUpperCase()} for: "${query.substring(0,25)}...". Your system prompt mode: "${systemP.substring(0,20)}...".`;
            const thinking = payload.useRag ? `<thinking>Query: "${query.substring(0,15)}..."\nLLM: ${llmInUse.toUpperCase()} (RAG)\nSystem Prompt: "${systemP.substring(0,30)}..."\n(Mock) Found context in '${MOCK_FILES_STORE[0]?.originalName || "mock_doc.pdf"}'.</thinking>` : `<thinking>Query: "${query.substring(0,15)}..."\nLLM: ${llmInUse.toUpperCase()} (Direct)\nSystem Prompt: "${systemP.substring(0,30)}..."\n(Mock) Processing direct query.</thinking>`;
            const references = payload.useRag ? [{ number: 1, source: MOCK_FILES_STORE[0]?.originalName || "default_mock.pdf", content_preview: "This is a snippet from the relevant mock document related to your query..."}] : [];
            const botMsg = { id: `bot-${Date.now()}`, role: 'model', parts: [{text: botText }], thinking, references, timestamp: new Date().toISOString(), source_pipeline: payload.useRag ? `mock_${llmInUse}_rag` : `mock_${llmInUse}_direct`};
            if (payload.sessionId) {
                if (!MOCK_CHAT_HISTORY_STORE[payload.sessionId]) MOCK_CHAT_HISTORY_STORE[payload.sessionId] = [];
                MOCK_CHAT_HISTORY_STORE[payload.sessionId].push(botMsg); 
                if(MOCK_SESSIONS_STORE[payload.sessionId]) { MOCK_SESSIONS_STORE[payload.sessionId].messageCount = (MOCK_SESSIONS_STORE[payload.sessionId].messageCount || 0) + 2; MOCK_SESSIONS_STORE[payload.sessionId].updatedAt = new Date().toISOString(); MOCK_SESSIONS_STORE[payload.sessionId].preview = botText.substring(0,50) + "..."; }
            }
            return { reply: botMsg, sessionId: payload.sessionId, source_pipeline: botMsg.source_pipeline };
        }
        const response = await apiClient.post('/chat/message', payload); return response.data;
    },

    getChatHistory: async (sessionId) => {
        if (DEV_MODE_MOCK_API) {
            await mockDelay(150); console.log("MOCK API (V1): getChatHistory for", sessionId);
            if (!MOCK_CHAT_HISTORY_STORE) MOCK_CHAT_HISTORY_STORE = {}; // Defensive
            return MOCK_CHAT_HISTORY_STORE[sessionId] || [];
        }
        const response = await apiClient.get(`/chat/history/${sessionId}`); return response.data;
    },

    getChatSessions: async () => {
        if (DEV_MODE_MOCK_API) {
            await mockDelay(150); console.log("MOCK API (V1): getChatSessions");
            if (!MOCK_SESSIONS_STORE) MOCK_SESSIONS_STORE = {}; // Defensive
            return Object.values(MOCK_SESSIONS_STORE).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        }
        const response = await apiClient.get('/chat/sessions'); return response.data;
    },

    startNewSession: async () => {
        if (DEV_MODE_MOCK_API) {
            await mockDelay(50); const newSid = `session-mock-new-${Date.now()}`;
            if (!MOCK_CHAT_HISTORY_STORE) MOCK_CHAT_HISTORY_STORE = {}; // Defensive
            if (!MOCK_SESSIONS_STORE) MOCK_SESSIONS_STORE = {}; // Defensive
            MOCK_CHAT_HISTORY_STORE[newSid] = [];
            MOCK_SESSIONS_STORE[newSid] = { sessionId: newSid, updatedAt: new Date().toISOString(), messageCount: 0, preview: "Newly Started Mock Session" };
            console.log("MOCK API (V1): startNewSession, created:", newSid);
            return { sessionId: newSid };
        }
        const response = await apiClient.post('/chat/new_session', {}); return response.data;
    },

    uploadFile: async (formData, onUploadProgress) => {
        if (DEV_MODE_MOCK_API) {
            const file = formData.get('file'); const mockFileName = file?.name || 'mock_upload.pdf';
            console.log("MOCK API (V1): uploadFile", mockFileName);
            if(onUploadProgress){ let p=0;const i=setInterval(()=>{p+=25;onUploadProgress({loaded:p,total:100});if(p>=100)clearInterval(i);},80);}
            await mockDelay(400);
            const newFileEntry = { serverFilename: `mock-server-${Date.now()}-${mockFileName}`, originalName: mockFileName, type: file?.type || 'application/octet-stream', size: file?.size || Math.floor(Math.random()*100000), lastModified: new Date().toISOString() };
            if (!MOCK_FILES_STORE) MOCK_FILES_STORE = []; // Defensive
            MOCK_FILES_STORE.unshift(newFileEntry);
            return { message: `${mockFileName} uploaded (mocked)!`, filename: newFileEntry.serverFilename, originalname: newFileEntry.originalName };
        }
        const response = await apiClient.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress }); return response.data;
    },

    getFiles: async () => {
        if (DEV_MODE_MOCK_API) { 
            await mockDelay(100); console.log("MOCK API (V1): getFiles"); 
            if (!MOCK_FILES_STORE) MOCK_FILES_STORE = []; // Defensive
            return [...MOCK_FILES_STORE]; 
        }
        const response = await apiClient.get('/files'); return response.data;
    },

    renameFile: async (serverFilename, newOriginalName) => {
         if (DEV_MODE_MOCK_API) {
            await mockDelay(); console.log("MOCK API (V1): renameFile", serverFilename, "to", newOriginalName);
            if (!MOCK_FILES_STORE) MOCK_FILES_STORE = []; // Defensive
            const file = MOCK_FILES_STORE.find(f => f.serverFilename === serverFilename);
            if (file) file.originalName = newOriginalName;
            return { message: "File renamed (mocked)" };
        }
        const response = await apiClient.patch(`/files/${serverFilename}`, { newOriginalName }); return response.data;
    },

    deleteFile: async (serverFilename) => {
         if (DEV_MODE_MOCK_API) {
            await mockDelay(); console.log("MOCK API (V1): deleteFile", serverFilename);
            if (!MOCK_FILES_STORE) MOCK_FILES_STORE = []; // Defensive
            MOCK_FILES_STORE = MOCK_FILES_STORE.filter(f => f.serverFilename !== serverFilename);
            return { message: "File deleted (mocked)" };
        }
        const response = await apiClient.delete(`/files/${serverFilename}`); return response.data;
    },

    requestAnalysis: async (payload) => {
        if (DEV_MODE_MOCK_API) {
            await mockDelay(payload.analysis_type === 'mindmap' ? 1200 : 600);
            console.log("MOCK API (V1): requestAnalysis", payload);
            if (!MOCK_ANALYSIS_RESULTS) MOCK_ANALYSIS_RESULTS = {}; // Defensive
            const result = MOCK_ANALYSIS_RESULTS[payload.analysis_type] || { content: `No mock data for ${payload.analysis_type} on ${payload.filename}`, thinking: "Used fallback."};
            return { ...result, content: result.content.replace("Selected Document", payload.filename || "the Document") };
        }
        const response = await apiClient.post('/analysis/document', payload); return response.data;
    },

    updateUserLLMConfig: async (configData) => {
        if (DEV_MODE_MOCK_API) { 
            await mockDelay(); console.log("MOCK API (V1): updateUserLLMConfig", configData);
            localStorage.setItem('mockUserLLMPreference', configData.llmProvider);
            if(configData.llmProvider === 'gemini' && configData.apiKey) localStorage.setItem('mockUserGeminiKeyStatus_V1', 'ProvidedDuringMock');
            if(configData.llmProvider === 'ollama' && configData.ollamaUrl) localStorage.setItem('mockUserOllamaUrl_V1', configData.ollamaUrl);
            return { message: `LLM preference updated (mocked).` };
        }
        const response = await apiClient.post('/user/config/llm', configData); return response.data;
    },

    getUserLLMConfig: async () => {
         if (DEV_MODE_MOCK_API) {
            await mockDelay(); const llmProvider = localStorage.getItem('mockUserLLMPreference') || 'ollama';
            console.log("MOCK API (V1): getUserLLMConfig, returning:", llmProvider);
            return { llmProvider };
        }
        const response = await apiClient.get('/user/config/llm'); return response.data;
    },

    getOrchestratorStatus: async () => {
        if (DEV_MODE_MOCK_API) { 
            await mockDelay(50); 
            return { status: "ok", message: "Backend (Mocked & Online)", database_status: "Connected (Mock)" };
        }
        const baseUrlForHealth = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api').replace('/api', '');
        const response = await axios.get(`${baseUrlForHealth}/api/health`);
        return response.data;
    },

    getSyllabus: async (subjectId) => {
        if(DEV_MODE_MOCK_API) { 
            await mockDelay(); console.log("MOCK API (V1): getSyllabus for", subjectId);
            return `# Mock Syllabus: ${subjectId}\n\n- Section 1: Intro to ${subjectId}\n- Section 2: Core Principles`;
        }
        const response = await apiClient.get(`/syllabus/${subjectId}`); return response.data;
    }
};

export default api;