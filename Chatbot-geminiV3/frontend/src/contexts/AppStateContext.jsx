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
    const [theme, setThemeState] = useState(() => {
        const storedTheme = localStorage.getItem('theme') || 'dark';
        if (typeof window !== 'undefined') {
            document.documentElement.classList.remove('light', 'dark');
            document.documentElement.classList.add(storedTheme);
        }
        return storedTheme;
    });

    const [selectedLLM, setSelectedLLM] = useState(localStorage.getItem('selectedLLM') || 'gemini'); // Default to gemini
    const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
    const [isRightPanelOpen, setIsRightPanelOpen] = useState(true); 
    
    const [currentSessionId, setCurrentSessionIdState] = useState(() => {
        return localStorage.getItem('aiTutorSessionId') || null;
    });
    
    const [systemPrompt, setSystemPromptState] = useState(localStorage.getItem('aiTutorSystemPrompt') || defaultSystemPromptText);
    const [selectedDocumentForAnalysis, setSelectedDocumentForAnalysisState] = useState(null);

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
    
    const setSessionId = (sessionId) => { // This is setGlobalSessionId in App.jsx
        if (sessionId) {
            localStorage.setItem('aiTutorSessionId', sessionId);
        } else {
            localStorage.removeItem('aiTutorSessionId');
        }
        setCurrentSessionIdState(sessionId); 
        console.log("AppStateContext: Global session ID updated to:", sessionId);
    };

    const setSystemPrompt = (promptText) => {
        setSystemPromptState(promptText);
        localStorage.setItem('aiTutorSystemPrompt', promptText);
    };

    const selectDocumentForAnalysis = (documentFile) => {
        setSelectedDocumentForAnalysisState(documentFile); // Stores filename string
        console.log("AppStateContext: Document selected for analysis:", documentFile || null);
    };

    useEffect(() => {
        const rootHtmlElement = document.documentElement;
        rootHtmlElement.classList.remove('light', 'dark');
        rootHtmlElement.classList.add(theme);
        document.body.className = ''; 
        document.body.classList.add(theme === 'dark' ? 'bg-background-dark' : 'bg-background-light');
    }, [theme]);

    return (
        <AppStateContext.Provider value={{
            theme, toggleTheme,
            selectedLLM, switchLLM,
            isLeftPanelOpen, setIsLeftPanelOpen,
            isRightPanelOpen, setIsRightPanelOpen,
            currentSessionId, setSessionId, 
            systemPrompt, setSystemPrompt,
            selectedDocumentForAnalysis, selectDocumentForAnalysis
        }}>
            {children}
        </AppStateContext.Provider>
    );
};