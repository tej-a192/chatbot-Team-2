// src/components/layout/CenterPanel.jsx
import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import ChatHistory from '../chat/ChatHistory';
import ChatInput from '../chat/ChatInput';
import api from '../../services/api';
import { useAuth as useRegularAuth } from '../../hooks/useAuth'; // Assuming useAuth is for regular users
import { useAppState } from '../../contexts/AppStateContext';
import toast from 'react-hot-toast';

function CenterPanel({ messages, setMessages, currentSessionId, chatStatus, setChatStatus }) {
    const { token: regularUserToken, user: regularUser } = useRegularAuth(); // Get token and user for regular auth
    const {
        selectedLLM,
        systemPrompt,
        selectedDocumentForAnalysis, // This is for RightPanel tools
        selectedSubject             // <<< Get the globally selected subject
    } = useAppState();

    const [useRag, setUseRag] = useState(true); // Default RAG to true, can be toggled by ChatInput
    const [isSending, setIsSending] = useState(false);
    const [criticalThinkingEnabled, setCriticalThinkingEnabled] = useState(false);

    const handleSendMessage = async (inputText, isCtEnabledFromInput) => {
        if (!inputText.trim() || !regularUserToken || !currentSessionId || isSending) {
            if (!currentSessionId) toast.error("No active session. Try 'New Chat'.");
            return;
        }

        const clientSideId = `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const userMessage = {
            id: clientSideId,
            sender: 'user',
            role: 'user', // For backend Gemini compatibility
            text: inputText.trim(),
            parts: [{ text: inputText.trim() }],
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setIsSending(true);

        let currentThinkingStatus = "Connecting to AI...";
        let ragContextNameForPayload = null;

        if (useRag) {
            // Prioritize selectedSubject for RAG context in chat
             ragContextNameForPayload = selectedSubject || selectedDocumentForAnalysis;

            if (ragContextNameForPayload) {
                currentThinkingStatus = `Using document "${ragContextNameForPayload}" & contacting ${selectedLLM.toUpperCase()}`;
            } else {
                currentThinkingStatus = `Contacting ${selectedLLM.toUpperCase()} (RAG - General Context)`;
            }
            if (isCtEnabledFromInput) {
                currentThinkingStatus += ` (CT requested)`;
            }
        } else { // Not using RAG
            currentThinkingStatus = `Contacting ${selectedLLM.toUpperCase()}`;
            if (isCtEnabledFromInput) currentThinkingStatus += ` (CT requested)`;
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
            criticalThinkingEnabled: isCtEnabledFromInput,
            documentContextName: ragContextNameForPayload, // <<< Use the determined RAG context name
            // 'filter' for RAG can be added here if you have a UI for it
        };

        try {
            console.log("CenterPanel: Sending payload to /api/chat/message:", payload);
            const response = await api.sendMessage(payload); // Regular user API call

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
            if (error.response?.data?.reply) { // If backend structures the error reply
                errorReplyMessage = {
                    ...error.response.data.reply,
                    id: `error-${Date.now()}-${Math.random().toString(16).slice(2)}`
                };
            } else {
                errorReplyMessage = {
                    id: `error-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    sender: 'bot',
                    role: 'model',
                    text: `Error: ${errorText}`,
                    parts: [{ text: `Error: ${errorText}` }],
                    timestamp: new Date().toISOString(),
                    thinking: "Error processing request.",
                    source_pipeline: "error-pipeline"
                };
            }
            setMessages(prev => [...prev, errorReplyMessage]);
            setChatStatus(`Error: ${errorText.substring(0, 70)}...`);
            toast.error(errorText);
        } finally {
            setIsSending(false);
        }
    };

    // Update chat status message based on selections
    useEffect(() => {
        if (!currentSessionId) {
            setChatStatus("Please login or start a new chat.");
        } else if (messages.length === 0 && !isSending) {
            if (selectedSubject) {
                setChatStatus(`Ready. Chatting with focus on subject: "${selectedSubject}".`);
            } else {
                setChatStatus("Ready. Send a message to start!");
            }
        }
        // If messages.length > 0 or isSending, the status is handled by handleSendMessage or API response
    }, [currentSessionId, messages.length, isSending, selectedSubject, setChatStatus]); // Added messages.length dependency

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark rounded-lg shadow-inner">
            {/* Welcome/Info display when chat is empty */}
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
                        {selectedSubject && ( // <<< Display selected subject for chat context
                            <p className="mt-1 font-medium">
                                Chat Focus (Subject): <span className="text-indigo-500 dark:text-indigo-400">{selectedSubject}</span>
                            </p>
                        )}
                        {selectedDocumentForAnalysis && ( // This is for Right Panel analysis tools
                            <p className="mt-1">
                                Analysis Target (Right Panel): <span className="font-medium text-primary dark:text-primary-light">{selectedDocumentForAnalysis}</span>
                            </p>
                        )}
                        <p className="mt-1">
                            {useRag ?
                                <span>RAG is <span className="text-green-500 font-semibold">ON</span>.
                                    {selectedSubject ? ` Using context from "${selectedSubject}".` : " Using general knowledge."}
                                </span>
                                : <span>RAG is <span className="text-red-500 font-semibold">OFF</span>. Chatting directly.</span>}
                        </p>
                        <p>
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
                currentStatus={chatStatus} // Pass the managed chatStatus
                useRag={useRag}
                setUseRag={setUseRag}
                criticalThinkingEnabled={criticalThinkingEnabled}
                setCriticalThinkingEnabled={setCriticalThinkingEnabled}
            />
        </div>
    );
}
export default CenterPanel;