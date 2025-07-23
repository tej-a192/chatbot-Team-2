// frontend/src/components/layout/CenterPanel.jsx
import React, { useState, useEffect, useRef } from 'react';
import ChatHistory from '../chat/ChatHistory';
import ChatInput from '../chat/ChatInput';
import api from '../../services/api';
import { useAuth as useRegularAuth } from '../../hooks/useAuth';
import { useAppState } from '../../contexts/AppStateContext';
import toast from 'react-hot-toast';

function CenterPanel({ messages, setMessages, currentSessionId, onChatProcessingChange }) {
    const { token: regularUserToken } = useRegularAuth();
    const { selectedLLM, systemPrompt, selectedDocumentForAnalysis, selectedSubject } = useAppState();

    const [useWebSearch, setUseWebSearch] = useState(false);
    const [useAcademicSearch, setUseAcademicSearch] = useState(false);
    const [criticalThinkingEnabled, setCriticalThinkingEnabled] = useState(false);
    const [isActuallySendingAPI, setIsActuallySendingAPI] = useState(false);
    const abortControllerRef = useRef(null);

    useEffect(() => {
        // Cleanup function
        return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
    }, []);

    const handleSendMessage = async (inputText) => {
        if (!inputText.trim() || !regularUserToken || !currentSessionId || isActuallySendingAPI) return;

        abortControllerRef.current = new AbortController();

        const userMessage = {
            id: `user-${Date.now()}`, sender: 'user', text: inputText.trim(),
            timestamp: new Date().toISOString(),
        };

        const streamingPlaceholderId = `bot-streaming-${Date.now()}`;
        const placeholderMessage = {
            id: streamingPlaceholderId,
            sender: 'bot',
            text: '',
            thinking: criticalThinkingEnabled ? '' : null, // Determines if dropdown shows initially
            isStreaming: true,
            timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage, placeholderMessage]);

        onChatProcessingChange(true);
        setIsActuallySendingAPI(true);

        try {
            if (criticalThinkingEnabled) {
                await handleStreamingSendMessage(inputText, streamingPlaceholderId);
            } else {
                await handleStandardSendMessage(inputText, streamingPlaceholderId);
            }
        } catch (error) {
            console.error("Error in handleSendMessage:", error);
            // Handle error by updating the placeholder
            setMessages(prev => prev.map(msg =>
                msg.id === streamingPlaceholderId
                ? { ...msg, isStreaming: false, text: `Error: ${error.message}` }
                : msg
            ));
        } finally {
            setIsActuallySendingAPI(false);
            onChatProcessingChange(false);
        }
    };
    
    const handleStreamingSendMessage = async (inputText, placeholderId) => {
        const payload = {
            query: inputText.trim(), sessionId: currentSessionId, useWebSearch, useAcademicSearch,
            systemPrompt, criticalThinkingEnabled, documentContextName: selectedSubject || selectedDocumentForAnalysis,
        };

        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/chat/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${regularUserToken}` },
            body: JSON.stringify(payload),
            signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Server error: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let finalBotMessageObject = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n').filter(line => line.startsWith('data: '));
            
            for (const line of lines) {
                const jsonString = line.replace('data: ', '');
                try {
                    const eventData = JSON.parse(jsonString);
                    if (eventData.type === 'thought') {
                        setMessages(prev => prev.map(msg =>
                            msg.id === placeholderId
                            ? { ...msg, thinking: (msg.thinking || '') + eventData.content }
                            : msg
                        ));
                    } else if (eventData.type === 'final_answer') {
                        finalBotMessageObject = eventData.content;
                    } else if (eventData.type === 'error') {
                        throw new Error(eventData.content);
                    }
                } catch (e) { console.error("Error parsing SSE chunk:", jsonString, e); }
            }
        }
        
        if (finalBotMessageObject) {
            setMessages(prev => prev.map(msg =>
                msg.id === placeholderId
                ? { ...finalBotMessageObject, id: placeholderId, sender: 'bot', isStreaming: false }
                : msg
            ));
        }
    };

    const handleStandardSendMessage = async (inputText, placeholderId) => {
        const response = await api.sendMessage({
            query: inputText.trim(), history: messages.slice(0, -2), sessionId: currentSessionId,
            useWebSearch, useAcademicSearch, systemPrompt, documentContextName: selectedSubject || selectedDocumentForAnalysis
        });

        if (response && response.reply) {
            setMessages(prev => prev.map(msg =>
                msg.id === placeholderId
                ? { ...response.reply, id: placeholderId, isStreaming: false }
                : msg
            ));
        } else {
            throw new Error("Invalid response from AI service.");
        }
    };

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark rounded-lg shadow-inner">
            <ChatHistory messages={messages} />
            <ChatInput
                onSendMessage={handleSendMessage} isLoading={isActuallySendingAPI}
                useWebSearch={useWebSearch} setUseWebSearch={setUseWebSearch}
                useAcademicSearch={useAcademicSearch} setUseAcademicSearch={setUseAcademicSearch}
                criticalThinkingEnabled={criticalThinkingEnabled} setCriticalThinkingEnabled={setCriticalThinkingEnabled}
            />
        </div>
    );
}

export default CenterPanel;