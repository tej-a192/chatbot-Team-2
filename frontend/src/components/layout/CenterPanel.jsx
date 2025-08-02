// frontend/src/components/layout/CenterPanel.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ChatHistory from '../chat/ChatHistory';
import ChatInput from '../chat/ChatInput';
import api from '../../services/api';
import { useAuth as useRegularAuth } from '../../hooks/useAuth';
import { useAppState } from '../../contexts/AppStateContext';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Globe, BookMarked, Code, TestTubeDiagonal, Sparkles, ChevronRight, Flame } from 'lucide-react';

const features = [
    {
        icon: Globe,
        title: "Web Search Agent",
        description: "Get real-time answers and information from the web for up-to-the-minute topics.",
        status: 'active',
        glowColor: 'blue'
    },
    {
        icon: BookMarked,
        title: "Academic Search",
        description: "Find and synthesize information from academic papers and scholarly articles.",
        status: 'active',
        glowColor: 'purple'
    },
    {
        icon: Code,
        title: "Secure Code Executor",
        description: "Write, compile, and run code in a sandboxed environment with AI assistance.",
        status: 'active',
        glowColor: 'orange'
    },
    {
        icon: TestTubeDiagonal,
        title: "API Endpoint Tester",
        description: "A tool for testing and validating API endpoints will be available soon.",
        status: 'soon',
        glowColor: 'gray'
    }
];

const glowStyles = {
    blue: "hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-[0_0_20px_theme(colors.blue.500/40%)]",
    purple: "hover:border-purple-400 dark:hover:border-purple-500 hover:shadow-[0_0_20px_theme(colors.purple.500/40%)]",
    orange: "hover:border-orange-400 dark:hover:border-orange-500 hover:shadow-[0_0_20px_theme(colors.orange.500/40%)]",
    gray: "" // No glow for disabled/soon cards
};

function CenterPanel({ messages, setMessages, currentSessionId, onChatProcessingChange, initialPromptForNewSession, setInitialPromptForNewSession, initialActivityForNewSession, setInitialActivityForNewSession }) {
    const { token: regularUserToken } = useRegularAuth();
    const { setSelectedSubject, systemPrompt, selectedDocumentForAnalysis, selectedSubject } = useAppState();
    const navigate = useNavigate();
    const location = useLocation();

    // Local state for toggles and component status
    const [useWebSearch, setUseWebSearch] = useState(false);
    const [useAcademicSearch, setUseAcademicSearch] = useState(false);
    const [criticalThinkingEnabled, setCriticalThinkingEnabled] = useState(false);
    const [isActuallySendingAPI, setIsActuallySendingAPI] = useState(false);
    const abortControllerRef = useRef(null);
    const [recommendations, setRecommendations] = useState([]);
    const [isLoadingRecs, setIsLoadingRecs] = useState(true);
    const [promptFromNav, setPromptFromNav] = useState('');
    
    // --- STABLE FUNCTION DEFINITIONS ---

    const handleStreamingSendMessage = useCallback(async (inputText, placeholderId, options) => {
        const payload = {
            query: inputText.trim(), 
            sessionId: currentSessionId, 
            useWebSearch: options.useWebSearch, 
            useAcademicSearch: options.useAcademicSearch,
            systemPrompt, 
            criticalThinkingEnabled: options.criticalThinkingEnabled, 
            documentContextName: options.documentContextName,
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
        let accumulatedThinking = '';

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
                        accumulatedThinking += eventData.content;
                        setMessages(prev => prev.map(msg => msg.id === placeholderId ? { ...msg, thinking: accumulatedThinking, _accumulatedContent: accumulatedThinking } : msg));
                    } else if (eventData.type === 'final_answer') {
                        finalBotMessageObject = eventData.content;
                    } else if (eventData.type === 'error') {
                        throw new Error(eventData.content);
                    }
                } catch (e) { 
                    console.error("Error parsing SSE chunk:", jsonString, e); 
                }
            }
        }
        
        if (finalBotMessageObject) {
            setMessages(prev => prev.map(msg => msg.id === placeholderId ? { ...finalBotMessageObject, id: placeholderId, sender: 'bot', isStreaming: false, thinking: accumulatedThinking || finalBotMessageObject.thinking } : msg));
        }
    }, [currentSessionId, systemPrompt, regularUserToken, setMessages]);

    const handleStandardSendMessage = useCallback(async (inputText, placeholderId, options) => {
        const response = await api.sendMessage({
            query: inputText.trim(), 
            history: messages.slice(0, -2),
            sessionId: currentSessionId,
            useWebSearch: options.useWebSearch,
            useAcademicSearch: options.useAcademicSearch, 
            systemPrompt, 
            documentContextName: options.documentContextName
        });

        if (response && response.reply) {
            setMessages(prev => prev.map(msg => msg.id === placeholderId ? { ...response.reply, id: placeholderId, isStreaming: false } : msg));
        } else {
            throw new Error("Invalid response from AI service.");
        }
    }, [messages, currentSessionId, systemPrompt, setMessages]);

    const handleSendMessage = useCallback(async (inputText, options = {}) => {
        if (!inputText.trim() || !regularUserToken || !currentSessionId || isActuallySendingAPI) return;

        const effectiveUseWebSearch = options.useWebSearch ?? useWebSearch;
        const effectiveUseAcademicSearch = options.useAcademicSearch ?? useAcademicSearch;
        const effectiveCriticalThinking = options.criticalThinkingEnabled ?? criticalThinkingEnabled;
        const effectiveDocumentContext = options.documentContextName ?? selectedSubject ?? selectedDocumentForAnalysis;

        abortControllerRef.current = new AbortController();

        const userMessage = {
            id: `user-${Date.now()}`,
            sender: 'user',
            text: inputText.trim(),
            timestamp: new Date().toISOString(),
        };

        const streamingPlaceholderId = `bot-streaming-${Date.now()}`;
        const placeholderMessage = {
            id: streamingPlaceholderId,
            sender: 'bot',
            text: '',
            thinking: effectiveCriticalThinking ? '' : null,
            isStreaming: true,
            timestamp: new Date().toISOString(),
            _accumulatedContent: ''
        };

        setMessages(prev => [...prev, userMessage, placeholderMessage]);
        onChatProcessingChange(true);
        setIsActuallySendingAPI(true);

        try {
            const handlerOptions = {
                useWebSearch: effectiveUseWebSearch,
                useAcademicSearch: effectiveUseAcademicSearch,
                criticalThinkingEnabled: effectiveCriticalThinking,
                documentContextName: effectiveDocumentContext
            };

            if (effectiveCriticalThinking) {
                await handleStreamingSendMessage(inputText, streamingPlaceholderId, handlerOptions);
            } else {
                await handleStandardSendMessage(inputText, streamingPlaceholderId, handlerOptions);
            }
        } catch (error) {
            console.error("Error in handleSendMessage:", error);
            setMessages(prev => prev.map(msg =>
                msg.id === streamingPlaceholderId
                ? { ...msg, isStreaming: false, text: `Error: ${error.message}` }
                : msg
            ));
            toast.error(error.message);
        } finally {
            setIsActuallySendingAPI(false);
            onChatProcessingChange(false);
            setUseWebSearch(false);
            setUseAcademicSearch(false);
        }
    }, [
        regularUserToken, currentSessionId, isActuallySendingAPI, useWebSearch, 
        useAcademicSearch, criticalThinkingEnabled, selectedSubject, 
        selectedDocumentForAnalysis, setMessages, onChatProcessingChange,
        handleStreamingSendMessage, handleStandardSendMessage, systemPrompt
    ]);
    
    // --- HOOKS ---

    useEffect(() => {
        const fetchRecommendations = async () => {
            if (messages.length === 0 && currentSessionId) {
                setIsLoadingRecs(true);
                try {
                    const data = await api.getRecommendations(currentSessionId);
                    setRecommendations(data.recommendations || []);
                } catch (error) {
                    console.error("Failed to fetch recommendations:", error);
                    setRecommendations([]);
                } finally {
                    setIsLoadingRecs(false);
                }
            }
        };
        fetchRecommendations();
    }, [currentSessionId, messages.length]);

    const handleFeatureClick = (title) => {
        switch (title) {
            case 'Web Search Agent':
                setUseWebSearch(true);
                toast.success("Web Search has been enabled for your next message.");
                break;
            case 'Academic Search':
                setUseAcademicSearch(true);
                toast.success("Academic Search has been enabled for your next message.");
                break;
            case 'Secure Code Executor':
                navigate('/tools/code-executor');
                break;
            case 'API Endpoint Tester':
                toast.info("The API Endpoint Tester is coming soon!");
                break;
            default:
                break;
        }
    };

    const handleRecommendationClick = async (rec) => {
        if (isActuallySendingAPI) return;
        setUseWebSearch(false);
        setUseAcademicSearch(false);

        // This is now an auto-sending action
        const options = {
            useWebSearch: rec.actionType === 'web_search',
            useAcademicSearch: rec.actionType === 'academic_search',
            documentContextName: null
        };
        
        let query = rec.topic;
        
        switch (rec.actionType) {
            case 'direct_answer':
                query = `Regarding the topic of "${rec.topic}", please provide a detailed explanation. Elaborate on the key concepts and provide clear examples.`;
                break;
            case 'web_search':
                query = `Search the web for the latest information on: ${rec.topic}`;
                break;
            case 'academic_search':
                query = `Find and summarize academic papers about: ${rec.topic}`;
                break;
            case 'document_review': {
                toast.loading(`Finding the best document for "${rec.topic}"...`, { id: 'doc-find-toast' });
                try {
                    const { documentName } = await api.findDocumentForTopic(rec.topic);
                    toast.success(`Focus set to document: ${documentName}`, { id: 'doc-find-toast' });
                    setSelectedSubject(documentName);
                    options.documentContextName = documentName;
                    query = `Based on the document "${documentName}", please explain "${rec.topic}".`;
                } catch (error) {
                    toast.error(error.message || `Could not find a document for "${rec.topic}".`, { id: 'doc-find-toast' });
                    return; // Stop execution if document not found
                }
                break;
            }
            default:
                toast.error(`Unknown recommendation type: ${rec.actionType}`);
                return; // Stop execution
        }
        
        toast.success(`Exploring "${rec.topic}" for you...`);
        handleSendMessage(query, options);
    };

    const RecommendationCard = ({ rec, index }) => (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
            className="relative p-[2px] rounded-lg group"
            style={{
                background: `conic-gradient(from var(--angle), #059669, #3b82f6, #9333ea, #059669)`,
                animation: 'spin-border 6s linear infinite',
            }}
        >
            <button
                onClick={() => handleRecommendationClick(rec)}
                disabled={isActuallySendingAPI}
                className="w-full h-full text-left bg-surface-light dark:bg-slate-800 rounded-[7px] p-4 flex flex-col justify-between transition-colors duration-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-60"
            >
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={16} className="text-primary dark:text-teal-400 flex-shrink-0 twinkling-text" />
                        <p className="text-sm font-semibold text-primary dark:text-primary-light uppercase tracking-wider truncate" title={rec.topic}>
                            {rec.topic}
                        </p>
                    </div>
                    <p className="text-sm text-text-muted-light dark:text-text-muted-dark mt-1 h-16">
                        {rec.suggestion_text}
                    </p>
                </div>
                <div className="mt-4 text-sm font-bold text-teal-500 dark:text-teal-400 self-start flex items-center gap-1.5 transition-transform duration-300 group-hover:translate-x-1">
                    Explore Now
                    <ChevronRight size={18} />
                </div>
            </button>
        </motion.div>
    );

    return (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark rounded-lg shadow-inner">
            {messages.length === 0 && !isActuallySendingAPI && currentSessionId ? (
                <div className="flex-1 flex flex-col justify-center items-center p-4 sm:p-8 overflow-y-auto custom-scrollbar animate-fadeIn">
                    <div className="w-full max-w-4xl mx-auto">
                        <div className="text-center">
                            <h1 className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r from-purple-500 to-blue-500 text-transparent bg-clip-text mb-4">
                                Welcome to iMentor
                            </h1>
                            <p className="text-lg md:text-xl text-text-muted-light dark:text-text-muted-dark font-medium">
                                Your personal AI-powered guide for learning and discovery.
                            </p>
                        </div>
                        
                        <hr className="border-border-light dark:border-border-dark my-8" />
                        
                        <div className="text-center">
                            <h2 className="text-2xl font-semibold mb-6 text-orange-500 animated-underline">
                                What's New
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                                {features.map((feature, index) => (
                                    <button 
                                        key={index}
                                        onClick={() => handleFeatureClick(feature.title)}
                                        disabled={feature.status === 'soon'}
                                        className={`group relative text-left bg-surface-light dark:bg-surface-dark/50 border border-border-light dark:border-border-dark rounded-lg p-4 transition-all duration-300 ease-in-out hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed ${glowStyles[feature.glowColor]}`}
                                    >
                                        <div className="relative">
                                            {feature.title === 'Secure Code Executor' && (
                                                <div className="fire-tag-animation absolute -top-2.5 -right-2.5 flex items-center gap-1 bg-gradient-to-br from-red-500 to-orange-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
                                                    <Flame size={12} />
                                                    HOT
                                                </div>
                                            )}
                                            {feature.status === 'soon' && <span className="absolute -top-2 -right-2 text-xs bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 font-semibold px-2 py-0.5 rounded-full">Coming Soon</span>}
                                            <div className="flex items-center gap-3 mb-2">
                                                <feature.icon className="w-6 h-6 text-primary dark:text-primary-light" />
                                                <h3 className="font-semibold text-text-light dark:text-text-dark">{feature.title}</h3>
                                            </div>
                                            <p className="text-sm text-text-muted-light dark:text-text-muted-dark">{feature.description}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {!isLoadingRecs && recommendations.length > 0 && (
                            <motion.div 
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
                                className="mt-12"
                            >
                                <div className="relative text-center mb-6">
                                    <hr className="border-border-light dark:border-border-dark" />
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-background-light dark:bg-background-dark px-4">
                                        <h3 className="text-xl font-bold flex items-center gap-2 bg-gradient-to-r from-accent to-green-400 text-transparent bg-clip-text twinkling-text">
                                            <Sparkles size={20} /> Recommended For You
                                        </h3>
                                    </div>
                                </div>
                                <p className="text-center text-sm text-text-muted-light dark:text-text-muted-dark mb-6">
                                    Based on your recent activity, here are a few suggestions to explore next.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
                                    {recommendations.map((rec, index) => (
                                        <RecommendationCard key={index} rec={rec} index={index} />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>
            ) : (
                <ChatHistory messages={messages} />
            )}
            
            <ChatInput
                onSendMessage={handleSendMessage} 
                isLoading={isActuallySendingAPI}
                useWebSearch={useWebSearch} 
                setUseWebSearch={setUseWebSearch}
                useAcademicSearch={useAcademicSearch} 
                setUseAcademicSearch={setUseAcademicSearch}
                criticalThinkingEnabled={criticalThinkingEnabled} 
                setCriticalThinkingEnabled={setCriticalThinkingEnabled}
                initialPrompt={initialPromptForNewSession}
                setInitialPromptForNewSession={setInitialPromptForNewSession}
            />

        </div>
    );
}

export default CenterPanel;