// frontend/src/contexts/AppStateContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';

export const AppStateContext = createContext(null);

export const useAppState = () => {
    const context = useContext(AppStateContext);
    if (!context) throw new Error('useAppState must be used within an AppStateProvider');
    return context;
};

const defaultSystemPromptText = "You are a helpful AI engineering tutor."; // Default prompt

export const AppStateProvider = ({ children }) => {
    const [theme, setThemeState] = useState(() => {
        const storedTheme = localStorage.getItem('theme') || 'dark';
        // console.log("AppStateContext: Initial theme from localStorage or default:", storedTheme);
        if (typeof window !== 'undefined') {
            const root = document.documentElement;
            root.classList.remove('light', 'dark');
            root.classList.add(storedTheme);
        }
        return storedTheme;
    });

    const [selectedLLM, setSelectedLLM] = useState(localStorage.getItem('selectedLLM') || 'ollama');
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true); 
    
    // Initialize currentSessionId from localStorage, or null if not found.
    // App.jsx will handle setting it after login if null or from auth response.
    const [currentSessionId, setCurrentSessionIdState] = useState(() => {
        const storedSessionId = localStorage.getItem('aiTutorSessionId');
        // console.log("AppStateContext: Initial sessionId from localStorage:", storedSessionId);
        return storedSessionId || null;
    });
    
    const [systemPrompt, setSystemPromptState] = useState(localStorage.getItem('aiTutorSystemPrompt') || defaultSystemPromptText);
    const [selectedDocumentForAnalysis, setSelectedDocumentForAnalysisState] = useState(null);


    const toggleTheme = () => {
        setThemeState(prevTheme => {
            const newTheme = prevTheme === 'light' ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme);
            // console.log("AppStateContext: Toggling theme to:", newTheme);
            return newTheme;
        });
    };
    
    const switchLLM = (llm) => {
         setSelectedLLM(llm); 
         localStorage.setItem('selectedLLM', llm);
         console.log("AppStateContext: Switched LLM to:", llm);
    };
    
    const setSessionId = (sessionId) => {
        if (sessionId) {
            localStorage.setItem('aiTutorSessionId', sessionId);
            // console.log("AppStateContext: Session ID persisted to localStorage:", sessionId);
        } else {
            localStorage.removeItem('aiTutorSessionId');
            // console.log("AppStateContext: Session ID removed from localStorage.");
        }
        setCurrentSessionIdState(sessionId); 
        console.log("AppStateContext: Global session ID updated to:", sessionId);
    };

    const setSystemPrompt = (promptText) => {
        setSystemPromptState(promptText);
        localStorage.setItem('aiTutorSystemPrompt', promptText);
        // console.log("AppStateContext: System prompt updated.");
    };

    const selectDocumentForAnalysis = (documentFile) => {
        setSelectedDocumentForAnalysisState(documentFile);
        // console.log("AppStateContext: Document selected for analysis:", documentFile?.originalName || null);
    };

    useEffect(() => {
        // console.log("AppStateContext: Theme useEffect triggered. Current theme state:", theme);
        const rootHtmlElement = document.documentElement;
        rootHtmlElement.classList.remove('light', 'dark');
        rootHtmlElement.classList.add(theme);
    }, [theme]);

    return (
        <AppStateContext.Provider value={{
            theme, toggleTheme,
            selectedLLM, switchLLM,
            isLeftPanelOpen, setIsLeftPanelOpen,
            isRightPanelOpen, setIsRightPanelOpen,
            currentSessionId, setSessionId, // Make sure this setSessionId is used by App.jsx
            systemPrompt, setSystemPrompt,
            selectedDocumentForAnalysis, selectDocumentForAnalysis
        }}>
            {children}
        </AppStateContext.Provider>
    );
};