// frontend/src/contexts/AppStateContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';

export const AppStateContext = createContext(null);

export const useAppState = () => {
    const context = useContext(AppStateContext);
    if (!context) throw new Error('useAppState must be used within an AppStateProvider');
    return context;
};

const defaultSystemPromptText = "You are a helpful AI engineering tutor.";

export const AppStateProvider = ({ children }) => {
    // --- Theme State ---
    const [theme, setThemeState] = useState(() => {
        const storedTheme = localStorage.getItem('theme') || 'dark'; // Default to dark
        if (typeof window !== 'undefined') {
            document.documentElement.classList.remove('light', 'dark');
            document.documentElement.classList.add(storedTheme);
        }
        return storedTheme;
    });

    // --- LLM and Panel States ---
    const [selectedLLM, setSelectedLLM] = useState(localStorage.getItem('selectedLLM') || 'gemini');
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

    // --- Session and Prompt States (for Regular Users) ---
    const [currentSessionId, setCurrentSessionIdState] = useState(() => {
        return localStorage.getItem('aiTutorSessionId') || null;
    });
    const [systemPrompt, setSystemPromptState] = useState(
        localStorage.getItem('aiTutorSystemPrompt') || defaultSystemPromptText
    );

    // --- Document/Subject Selection States (for Regular Users) ---
    const [selectedDocumentForAnalysis, setSelectedDocumentForAnalysisState] = useState(null); // For right-panel analysis tools
    const [selectedSubject, setSelectedSubjectState] = useState(
        localStorage.getItem('aiTutorSelectedSubject') || null // For chat RAG context (admin doc name)
    );

    // --- Admin Session State ---
    const [isAdminSessionActive, setIsAdminSessionActiveState] = useState(() => {
        return sessionStorage.getItem('isAdminSessionActive') === 'true';
    });

    // --- Setters and Toggles ---
    const toggleTheme = () => {
        setThemeState(prevTheme => {
            const newTheme = prevTheme === 'light' ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            return newTheme;
        });
    };

    const switchLLM = (llm) => {
         setSelectedLLM(llm);
         localStorage.setItem('selectedLLM', llm);
         console.log("AppStateContext: Switched LLM to:", llm);
    };

    const setSessionId = (sessionId) => { // For regular user chat sessions
        if (sessionId) {
            localStorage.setItem('aiTutorSessionId', sessionId);
        } else {
            localStorage.removeItem('aiTutorSessionId');
        }
        setCurrentSessionIdState(sessionId);
        console.log("AppStateContext: Regular user session ID updated to:", sessionId);
    };

    const setSystemPrompt = (promptText) => {
        setSystemPromptState(promptText);
        localStorage.setItem('aiTutorSystemPrompt', promptText);
    };

    const selectDocumentForAnalysis = (documentFilename) => { // For right-panel tools
        setSelectedDocumentForAnalysisState(documentFilename);
        console.log("AppStateContext: Document for analysis tools set to:", documentFilename || "None");
        // If a specific document is chosen for analysis tools, it implies a focused task.
        // You might decide to clear the broader "selectedSubject" for chat RAG to avoid confusion.
        if (documentFilename && selectedSubject) {
            // setSelectedSubject(null); // Calls the setter below
            // console.log("AppStateContext: Cleared selected subject because a specific document was chosen for analysis tools.");
        }
    };

    const setSelectedSubject = (subjectName) => { // For chat RAG context
        const newSubject = subjectName === "none" || !subjectName ? null : subjectName;
        if (newSubject) {
            localStorage.setItem('aiTutorSelectedSubject', newSubject);
        } else {
            localStorage.removeItem('aiTutorSelectedSubject');
        }
        setSelectedSubjectState(newSubject);
        console.log("AppStateContext: Selected subject (for chat RAG) updated to:", newSubject || "None");

        // When a subject is selected for chat, clear any document specifically chosen for right-panel analysis tools.
        if (newSubject) {
            selectDocumentForAnalysis(null); // Use the existing setter
            console.log("AppStateContext: Cleared document for analysis tools due to new subject selection.");
        }
    };

    const setIsAdminSessionActive = (isActive) => { // For admin "login" state
        if (isActive) {
            sessionStorage.setItem('isAdminSessionActive', 'true');
            // When admin becomes active, clear regular user's session ID and selected subject/document.
            // This prevents admin session from using regular user's context.
            setSessionId(null);
            setSelectedSubject(null); // This will also clear selectedDocumentForAnalysis
            // The regular user's JWT token remains in localStorage but App.jsx logic prevents its use.
        } else {
            sessionStorage.removeItem('isAdminSessionActive');
        }
        setIsAdminSessionActiveState(isActive);
        console.log("AppStateContext: Admin session active status set to:", isActive);
    };

    // Effect to apply theme to HTML element and body
    useEffect(() => {
        const rootHtmlElement = document.documentElement;
        rootHtmlElement.classList.remove('light', 'dark');
        rootHtmlElement.classList.add(theme);

        document.body.className = ''; // Clear existing body classes just in case
        document.body.classList.add(theme === 'dark' ? 'bg-background-dark' : 'bg-background-light');
        // console.log("AppStateContext: Theme effect, theme is:", theme); // Can be noisy
    }, [theme]);

    return (
        <AppStateContext.Provider value={{
            theme, toggleTheme,
            selectedLLM, switchLLM,
            isLeftPanelOpen, setIsLeftPanelOpen,
            isRightPanelOpen, setIsRightPanelOpen,
            currentSessionId, setSessionId, // Renamed from setGlobalSessionId in App.jsx to just setSessionId here
            systemPrompt, setSystemPrompt,
            selectedDocumentForAnalysis, selectDocumentForAnalysis,
            selectedSubject, setSelectedSubject,             // <<< EXPOSED
            isAdminSessionActive, setIsAdminSessionActive   // <<< EXPOSED
        }}>
            {children}
        </AppStateContext.Provider>
    );
};