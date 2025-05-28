// import React, { useState, useEffect } from 'react';
// import ChatHistory from '../chat/ChatHistory';
// import ChatInput from '../chat/ChatInput';
// import api from '../../services/api';
// import { useAuth } from '../../hooks/useAuth';
// import { useAppState } from '../../contexts/AppStateContext';
// import toast from 'react-hot-toast';

// function CenterPanel({ messages, setMessages, currentSessionId, chatStatus, setChatStatus }) {
//     const { token } = useAuth();
//     const { selectedLLM } = useAppState(); // To know which LLM is active
//     const [useRag, setUseRag] = useState(false); // Local state for RAG toggle in this panel
//     const [isSending, setIsSending] = useState(false);
    
//     const handleSendMessage = async (inputText) => {
//         if (!inputText.trim() || !token || isSending) return;

//         const userMessage = {
//             id: `user-${Date.now()}`,
//             sender: 'user',
//             text: inputText.trim(),
//             timestamp: new Date().toISOString()
//         };
//         setMessages(prev => [...prev, userMessage]);
        
//         setIsSending(true);
//         setChatStatus(useRag ? "Searching documents & Thinking (Ollama RAG)..." : "Thinking (Gemini)...");

//         try {
//             const historyForBackend = messages.map(m => ({ // Only previous messages
//                 role: m.sender === 'bot' ? 'model' : 'user',
//                 parts: [{ text: m.text }]
//             }));

//             const payload = {
//                 query: inputText.trim(),
//                 history: historyForBackend,
//                 sessionId: currentSessionId,
//                 useRag: useRag // This flag is crucial for the backend orchestrator
//             };
            
//             const response = await api.sendMessage(payload); // Token auto-included by axios interceptor
            
//             // currentSessionId is managed by App.js if backend returns a new one
//             // For now, assume session ID remains the same unless explicitly changed by App.js

//             const botReply = response.reply;
//             setMessages(prev => [...prev, {
//                 id: `bot-${Date.now()}`,
//                 sender: 'bot',
//                 text: botReply.parts[0]?.text,
//                 thinking: botReply.thinking,
//                 references: botReply.references || [],
//                 timestamp: botReply.timestamp,
//                 source_pipeline: response.source_pipeline // Useful for display
//             }]);
//             setChatStatus(`Responded via ${response.source_pipeline}.`);
//         } catch (error) {
//             console.error("Error sending message:", error);
//             const errorText = error.response?.data?.message || error.message || 'Failed to get response.';
//             setMessages(prev => [...prev, { 
//                 id: `error-${Date.now()}`, 
//                 sender: 'bot', 
//                 text: `Error: ${errorText}` 
//             }]);
//             setChatStatus(`Error: ${errorText}`);
//             toast.error(errorText);
//         } finally {
//             setIsSending(false);
//         }
//     };

//     return (
//         <div className="flex flex-col h-full bg-background-light dark:bg-background-dark rounded-lg shadow-inner">
//             {/* Welcome Message - Conditional */}
//             {messages.length === 0 && !isSending && (
//                  <div className="p-8 text-center text-text-muted-light dark:text-text-muted-dark animate-fadeIn">
//                     <h2 className="text-2xl font-semibold mb-2">HELLO MY FRIEND,</h2>
//                     <p className="text-lg">HOW CAN I ASSIST YOU TODAY?</p>
//                     <p className="text-sm mt-4">
//                         Toggle "Use My Documents" below to chat with your uploaded files using Ollama RAG,
//                         or chat directly with {selectedLLM.toUpperCase()} for general queries.
//                     </p>
//                 </div>
//             )}

//             <ChatHistory messages={messages} isLoading={isSending} />
//             <ChatInput 
//                 onSendMessage={handleSendMessage} 
//                 isLoading={isSending} 
//                 currentStatus={chatStatus}
//                 useRag={useRag}
//                 setUseRag={setUseRag}
//             />
//         </div>
//     );
// }
// export default CenterPanel;






// src/components/layout/CenterPanel.jsx
import React, { useState } from 'react';
import ChatHistory from '../chat/ChatHistory';
import ChatInput from '../chat/ChatInput';
import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { useAppState } from '../../contexts/AppStateContext';
import toast from 'react-hot-toast';

function CenterPanel({ messages, setMessages, currentSessionId, chatStatus, setChatStatus }) {
    const { token } = useAuth();
    // Get systemPrompt from global state
    const { selectedLLM, systemPrompt } = useAppState(); 
    const [useRag, setUseRag] = useState(false); // RAG toggle state
    const [isSending, setIsSending] = useState(false);
    
    const handleSendMessage = async (inputText) => {
        if (!inputText.trim() || !token || isSending) return;

        const userMessage = {
            id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            sender: 'user',
            text: inputText.trim(),
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMessage]);
        
        setIsSending(true);
        let thinkingStatus = "Thinking...";
        if (useRag) {
            thinkingStatus = `Searching docs & Thinking (${selectedLLM.toUpperCase()} RAG)...`;
        } else {
            thinkingStatus = `Thinking (${selectedLLM.toUpperCase()})...`;
        }
        // Add system prompt to status if it's custom or not the default
        const defaultInitialPrompt = "You are a helpful AI engineering tutor."; // Or fetch from your presets
        if (systemPrompt && systemPrompt !== defaultInitialPrompt) {
            thinkingStatus += ` (Mode: ${systemPrompt.substring(0,25)}...)`;
        }
        setChatStatus(thinkingStatus);


        try {
            const historyForBackend = messages.map(m => ({
                role: m.sender === 'bot' ? 'model' : 'user',
                parts: [{ text: m.text }]
            }));

            const payload = {
                query: inputText.trim(),
                history: historyForBackend,
                sessionId: currentSessionId,
                useRag: useRag,
                llmProvider: selectedLLM, // Send the selected LLM provider
                systemPrompt: systemPrompt // Send the current system prompt text
            };
            
            const response = await api.sendMessage(payload);
            
            const botReply = response.reply;
            if (botReply && botReply.parts && botReply.parts.length > 0) {
                setMessages(prev => [...prev, {
                    id: `bot-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                    sender: 'bot',
                    text: botReply.parts[0]?.text,
                    thinking: botReply.thinking,
                    references: botReply.references || [],
                    timestamp: botReply.timestamp || new Date().toISOString(),
                    source_pipeline: response.source_pipeline
                }]);
                setChatStatus(`Responded via ${response.source_pipeline || selectedLLM.toUpperCase()}.`);
            } else {
                throw new Error("Invalid response structure from AI.");
            }

        } catch (error) {
            console.error("Error sending message:", error);
            const errorText = error.response?.data?.message || error.message || 'Failed to get response.';
            setMessages(prev => [...prev, { 
                id: `error-${Date.now()}-${Math.random().toString(16).slice(2)}`, 
                sender: 'bot', 
                text: `Error: ${errorText}`,
                timestamp: new Date().toISOString()
            }]);
            setChatStatus(`Error: ${errorText.substring(0,50)}...`);
            toast.error(errorText);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark rounded-lg shadow-inner">
            {messages.length === 0 && !isSending && (
                 <div className="p-6 sm:p-8 text-center text-text-muted-light dark:text-text-muted-dark animate-fadeIn">
                    <h2 className="text-xl sm:text-2xl font-semibold mb-2 text-text-light dark:text-text-dark">HELLO MY FRIEND,</h2>
                    <p className="text-base sm:text-lg mb-3">HOW CAN I ASSIST YOU TODAY?</p>
                    <div className="text-xs sm:text-sm space-y-1">
                        <p>
                            Current LLM: <span className="font-semibold text-accent">{selectedLLM.toUpperCase()}</span>.
                        </p>
                        <p className="max-w-md mx-auto">
                            Assistant Mode: <span className="italic">"{systemPrompt.length > 60 ? systemPrompt.substring(0,60)+'...' : systemPrompt}"</span>
                        </p>
                        <p className="mt-2">
                            Toggle "Use My Docs" below for RAG-enhanced chat.
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
            />
        </div>
    );
}
export default CenterPanel;