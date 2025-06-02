// src/components/layout/CenterPanel.jsx
import React, { useState, useEffect } from 'react';
import ChatHistory from '../chat/ChatHistory';
import ChatInput from '../chat/ChatInput';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useAppState } from '../../contexts/AppStateContext';
import toast from 'react-hot-toast';

function CenterPanel({ messages, setMessages, currentSessionId, chatStatus, setChatStatus }) {
    const { token, user } = useAuth();
    const { selectedLLM, systemPrompt, selectedDocumentForAnalysis } = useAppState(); 
    const [useRag, setUseRag] = useState(false); 
    const [isSending, setIsSending] = useState(false);
    const [criticalThinkingEnabled, setCriticalThinkingEnabled] = useState(false); // New state for CT

    const handleSendMessage = async (inputText) => {
        if (!inputText.trim() || !token || !currentSessionId || isSending) {
            if (!currentSessionId) toast.error("No active session. Try 'New Chat'.");
            return;
        }

        const clientSideId = `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const userMessage = {
            id: clientSideId, 
            sender: 'user',
            role: 'user', 
            text: inputText.trim(),
            parts: [{ text: inputText.trim() }], 
            timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, userMessage]);
        
        setIsSending(true);
        let currentThinkingStatus = "Connecting to AI...";
        if (useRag && criticalThinkingEnabled) {
            currentThinkingStatus = `Searching docs, retrieving KG & Contacting ${selectedLLM.toUpperCase()} (RAG + CT)...`;
        } else if (useRag) {
            currentThinkingStatus = `Searching documents & Contacting ${selectedLLM.toUpperCase()} (RAG)...`;
        } else if (criticalThinkingEnabled) {
            currentThinkingStatus = `Retrieving KG & Contacting ${selectedLLM.toUpperCase()} (CT)...`;
        } else {
            currentThinkingStatus = `Contacting ${selectedLLM.toUpperCase()}...`;
        }
        setChatStatus(currentThinkingStatus);

        const historyForBackend = messages.map(m => ({
            role: m.sender === 'bot' ? 'model' : 'user',
            parts: m.parts || [{ text: m.text }], 
            timestamp: m.timestamp,
            ...(m.sender === 'bot' && { 
                thinking: m.thinking,
                references: m.references,
                source_pipeline: m.source_pipeline
            })
        }));
        
        const payload = {
            query: inputText.trim(), 
            history: historyForBackend,
            sessionId: currentSessionId,
            useRag: useRag,
            llmProvider: selectedLLM, 
            systemPrompt: systemPrompt,
            useCriticalThinking: criticalThinkingEnabled, // Pass CT state
            documentContextName: selectedDocumentForAnalysis || null, // Pass selected doc for KG or RAG filter
        };
            
        try {
            console.log("CenterPanel: Sending payload to /api/chat/message:", payload);
            const response = await api.sendMessage(payload); 
            
            if (response && response.reply) {
                const aiReply = {
                    ...response.reply, 
                    id: `bot-${Date.now()}-${Math.random().toString(16).slice(2)}` 
                };
                setMessages(prev => [...prev, aiReply]);
                setChatStatus(`Responded via ${aiReply.source_pipeline || selectedLLM.toUpperCase()}.`);
            } else {
                throw new Error("Invalid or empty response structure from AI service.");
            }

        } catch (error) {
            console.error("Error sending message:", error);
            const errorText = error.response?.data?.message || error.message || 'Failed to get response from AI.';
            
            let errorReplyMessage;
            if (error.response?.data?.reply) {
                errorReplyMessage = {
                    ...error.response.data.reply,
                    id: `error-${Date.now()}-${Math.random().toString(16).slice(2)}`
                };
            } else {
                errorReplyMessage = { 
                    id: `error-${Date.now()}-${Math.random().toString(16).slice(2)}`, 
                    sender: 'bot', 
                    text: `Error: ${errorText}`,
                    parts: [{ text: `Error: ${errorText}` }],
                    timestamp: new Date().toISOString(),
                    thinking: "Error processing request.",
                    source_pipeline: "error"
                };
            }
            setMessages(prev => [...prev, errorReplyMessage]);
            setChatStatus(`Error: ${errorText.substring(0,70)}...`);
            toast.error(errorText);
        } finally {
            setIsSending(false);
        }
    };
    
    useEffect(() => {
        if (!currentSessionId) {
            setChatStatus("Please login or start a new chat.");
        } else if (messages.length === 0 && !isSending) {
            setChatStatus("Ready. Send a message to start!");
        }
    }, [currentSessionId, messages, isSending]);


    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark rounded-lg shadow-inner">
            {messages.length === 0 && !isSending && currentSessionId && (
                 <div className="p-6 sm:p-8 text-center text-text-muted-light dark:text-text-muted-dark animate-fadeIn">
                    <h2 className="text-xl sm:text-2xl font-semibold mb-2 text-text-light dark:text-text-dark">
                        AI Engineering Tutor
                    </h2>
                    <p className="text-base sm:text-lg mb-3">Session ID: {currentSessionId.substring(0,8)}...</p>
                    <div className="text-xs sm:text-sm space-y-1">
                        <p>Current LLM: <span className="font-semibold text-accent">{selectedLLM.toUpperCase()}</span>.</p>
                        <p className="max-w-md mx-auto">
                            Assistant Mode: <span className="italic">"{systemPrompt.length > 60 ? systemPrompt.substring(0,60)+'...' : systemPrompt}"</span>
                        </p>
                        {selectedDocumentForAnalysis && (
                            <p className="mt-1">
                                Analysis Target: <span className="font-medium text-primary dark:text-primary-light">{selectedDocumentForAnalysis}</span>
                            </p>
                        )}
                        <p className="mt-1">
                            {useRag ? <span>RAG is <span className="text-green-500 font-semibold">ON</span>. Using document context.</span> 
                                  : <span>RAG is <span className="text-red-500 font-semibold">OFF</span>. Chatting directly.</span>}
                        </p>
                        <p> {/* New status for Critical Thinking */}
                            {criticalThinkingEnabled ? <span>Critical Thinking (KG) is <span className="text-purple-500 font-semibold">ON</span>.</span> 
                                  : <span>Critical Thinking (KG) is <span className="text-gray-500 font-semibold">OFF</span>.</span>}
                        </p>
                    </div>
                </div>
            )}

            <ChatHistory messages={messages} isLoading={isSending} />
            <ChatInput 
                onSendMessage={handleSendMessage} 
                isLoading={isSending} 
                currentStatus={chatStatus}
                useRag={useRag}
                setUseRag={setUseRag}
                criticalThinkingEnabled={criticalThinkingEnabled} // Pass state
                setCriticalThinkingEnabled={setCriticalThinkingEnabled} // Pass setter
            />
        </div>
    );
}
export default CenterPanel;