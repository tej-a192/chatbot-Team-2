// frontend/src/components/layout/CenterPanel.jsx
import React, { useState, useEffect, useRef } from 'react';
import ChatHistory from '../chat/ChatHistory';
import ChatInput from '../chat/ChatInput';
import api from '../../services/api';
import { useAuth as useRegularAuth } from '../../hooks/useAuth';
import { useAppState } from '../../contexts/AppStateContext';
import toast from 'react-hot-toast';

const THINKING_VARIANTS = ["🧠 Thinking...", "💭 Processing...", "🤔 Analyzing query..."];
const RAG_ANALYSIS_VARIANTS = ["📚 Reviewing documents...", "🎯 Finding relevant info...", "🧩 Combining sources..."];
const WEB_ANALYSIS_VARIANTS = ["🌐 Searching the web...", "🔎 Filtering results...", "📰 Reading latest info..."];
const ACADEMIC_ANALYSIS_VARIANTS = ["🎓 Searching academic papers...", "🔬 Reviewing studies...", "📚 Compiling research..."];
const GENERAL_ANALYSIS_VARIANTS = ["📊 Analyzing context...", "🔍 Searching knowledge base..."];
const GENERATION_VARIANTS = ["✨ Generating response...", "🚀 Crafting answer...", "📝 Preparing explanation..."];

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function CenterPanel({ messages, setMessages, currentSessionId, onChatProcessingChange }) {
    const { token: regularUserToken } = useRegularAuth();
    const { selectedLLM, systemPrompt, selectedDocumentForAnalysis, selectedSubject } = useAppState();

    const [useWebSearch, setUseWebSearch] = useState(false);
    const [useAcademicSearch, setUseAcademicSearch] = useState(false);
    const [criticalThinkingEnabled, setCriticalThinkingEnabled] = useState(false);
    const [botStatusPlaceholder, setBotStatusPlaceholder] = useState(null);
    const isMountedRef = useRef(true);
    const simulationControllerRef = useRef(new AbortController());
    const [isActuallySendingAPI, setIsActuallySendingAPI] = useState(false);

    const abortControllerRef = useRef(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            simulationControllerRef.current.abort();
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    useEffect(() => {
        const documentContext = selectedSubject || selectedDocumentForAnalysis;
        if (documentContext && (useWebSearch || useAcademicSearch)) {
            setUseWebSearch(false);
            setUseAcademicSearch(false);
            toast("Web and Academic Search disabled automatically while a document is selected.", { icon: "ℹ️" });
        }
    }, [selectedDocumentForAnalysis, selectedSubject, useWebSearch, useAcademicSearch]);

    const runStatusSimulation = async (isRagActive, isWebActive, isAcademicActive, signal) => {
        let analysisVariants;
        if (isWebActive) analysisVariants = WEB_ANALYSIS_VARIANTS;
        else if (isAcademicActive) analysisVariants = ACADEMIC_ANALYSIS_VARIANTS;
        else if (isRagActive) analysisVariants = RAG_ANALYSIS_VARIANTS;
        else analysisVariants = GENERAL_ANALYSIS_VARIANTS;

        const sequence = [
            { message: getRandomItem(THINKING_VARIANTS), duration: 1200 },
            { message: getRandomItem(analysisVariants), duration: 1500 },
            { message: getRandomItem(GENERATION_VARIANTS), duration: 1300 },
        ];

        for (const stage of sequence) {
            if (signal.aborted) return;
            setBotStatusPlaceholder(stage.message);
            await wait(stage.duration + (Math.random() * 400 - 200));
        }
    };

    const handleSendMessage = async (inputText) => {
        if (!inputText.trim() || !regularUserToken || !currentSessionId || isActuallySendingAPI) return;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        const userMessage = {
            id: `user-${Date.now()}`, sender: 'user', role: 'user', text: inputText.trim(),
            parts: [{ text: inputText.trim() }], timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMessage]);
        onChatProcessingChange(true);
        setIsActuallySendingAPI(true);

        if (criticalThinkingEnabled) {
            await handleStreamingSendMessage(inputText);
        } else {
            await handleStandardSendMessage(inputText);
        }
    };

    // --- MODIFIED: The streaming handler has been updated ---
    const handleStreamingSendMessage = async (inputText) => {
        setBotStatusPlaceholder("🧠 Engaging multi-step reasoning...");
        
        const payload = {
            query: inputText.trim(), sessionId: currentSessionId, useWebSearch, useAcademicSearch,
            systemPrompt, criticalThinkingEnabled, documentContextName: selectedSubject || selectedDocumentForAnalysis,
        };

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/chat/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${regularUserToken}`,
                },
                body: JSON.stringify(payload),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Server responded with status ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            // --- THIS IS THE FIX ---
            // This variable will now hold the full message object, not just a string.
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
                            setBotStatusPlaceholder(`🤔 ${eventData.content}`);
                        } else if (eventData.type === 'final_answer') {
                            // The `content` is now the full message object
                            finalBotMessageObject = eventData.content;
                        } else if (eventData.type === 'error') {
                            throw new Error(eventData.content);
                        }
                    } catch (e) {
                        console.error("Error parsing SSE chunk:", jsonString, e);
                    }
                }
            }
            
            // Once the stream is finished, add the final message object to state
            if (finalBotMessageObject) {
                 const messageWithClientSideData = {
                    ...finalBotMessageObject,
                    id: `bot-${Date.now()}`,
                    sender: 'bot',
                    role: 'model',
                    timestamp: new Date().toISOString(),
                    parts: [{ text: finalBotMessageObject.text || '' }]
                 };
                setMessages(prev => [...prev, messageWithClientSideData]);
            }
            // --- END OF FIX ---
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log("Fetch request aborted.");
                return;
            }
            const errorText = error.message || 'Failed to get streaming response from AI.';
            const errorReply = {
                id: `error-${Date.now()}`, sender: 'bot', role: 'model',
                text: `Error: ${errorText}`, parts: [{ text: `Error: ${errorText}` }],
                timestamp: new Date().toISOString(), source_pipeline: "error-pipeline"
            };
            setMessages(prev => [...prev, errorReply]);
            toast.error(errorText);
        } finally {
             if (isMountedRef.current) {
                setBotStatusPlaceholder(null);
                onChatProcessingChange(false);
                setIsActuallySendingAPI(false);
            }
        }
    };


    const handleStandardSendMessage = async (inputText) => {
        const documentContextName = selectedSubject || selectedDocumentForAnalysis;
        const isRagActive = !!documentContextName;
        simulationControllerRef.current.abort();
        simulationControllerRef.current = new AbortController();
        setBotStatusPlaceholder("🧠 Thinking...");
        runStatusSimulation(isRagActive, useWebSearch, useAcademicSearch, simulationControllerRef.current.signal);

        try {
            const response = await api.sendMessage({
                query: inputText.trim(),
                history: messages.map(m => ({ role: m.role, parts: m.parts || [{ text: m.text }] })),
                sessionId: currentSessionId, useWebSearch, useAcademicSearch, systemPrompt,
                criticalThinkingEnabled, documentContextName
            });

            if (response && response.reply) {
                if (isMountedRef.current) {
                    setMessages(prev => [...prev, { ...response.reply, id: `bot-${Date.now()}` }]);
                }
            } else {
                throw new Error("Invalid response from AI service.");
            }
        } catch (error) {
            const errorText = error.response?.data?.message || error.message || 'Failed to get response from AI.';
            const errorReply = {
                id: `error-${Date.now()}`, sender: 'bot', role: 'model',
                text: `Error: ${errorText}`, parts: [{ text: `Error: ${errorText}` }],
                timestamp: new Date().toISOString(), source_pipeline: "error-pipeline"
            };
            if (isMountedRef.current) {
                setMessages(prev => [...prev, errorReply]);
            }
            toast.error(errorText);
        } finally {
            simulationControllerRef.current.abort();
            if (isMountedRef.current) {
                setBotStatusPlaceholder(null);
                onChatProcessingChange(false);
                setIsActuallySendingAPI(false);
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark rounded-lg shadow-inner">
            {messages.length === 0 && !isActuallySendingAPI && currentSessionId ? (
                 <div className="p-6 sm:p-8 text-center text-text-muted-light dark:text-text-muted-dark animate-fadeIn">
                    <h2 className="text-xl sm:text-2xl font-semibold mb-2 text-text-light dark:text-text-dark">AI Engineering Tutor</h2>
                    <p className="text-base sm:text-lg mb-3">Session ID: {currentSessionId.substring(0, 8)}...</p>
                    <div className="text-xs sm:text-sm space-y-1">
                        <p>Current LLM: <span className="font-semibold text-accent">{selectedLLM.toUpperCase()}</span>.</p>
                        <p className="max-w-md mx-auto">
                            Assistant Mode: <span className="italic">"{systemPrompt.length > 60 ? systemPrompt.substring(0, 60) + '...' : systemPrompt}"</span>
                        </p>
                        {(selectedSubject || selectedDocumentForAnalysis) && (
                            <p className="mt-1 font-medium">
                                Chat Focus: <span className="text-indigo-500 dark:text-indigo-400">{selectedSubject || selectedDocumentForAnalysis}</span>
                            </p>
                        )}
                    </div>
                </div>
            ) : null}

            <ChatHistory messages={messages} botStatusPlaceholder={botStatusPlaceholder} />

            <ChatInput
                onSendMessage={handleSendMessage}
                isLoading={isActuallySendingAPI}
                useWebSearch={useWebSearch}
                setUseWebSearch={setUseWebSearch}
                useAcademicSearch={useAcademicSearch} 
                setUseAcademicSearch={setUseAcademicSearch}
                criticalThinkingEnabled={criticalThinkingEnabled}
                setCriticalThinkingEnabled={setCriticalThinkingEnabled}
            />
        </div>
    );
}

export default CenterPanel;