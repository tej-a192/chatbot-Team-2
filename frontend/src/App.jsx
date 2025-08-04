// frontend/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth as useRegularAuth } from './hooks/useAuth.jsx';
import { useAppState } from './contexts/AppStateContext.jsx';
import AuthModal from './components/auth/AuthModal.jsx';
import TopNav from './components/layout/TopNav.jsx';
import LeftPanel from './components/layout/LeftPanel.jsx';
import CenterPanel from './components/layout/CenterPanel.jsx';
import RightPanel from './components/layout/RightPanel.jsx';
import LeftCollapsedNav from './components/layout/LeftCollapsedNav.jsx';
import RightCollapsedNav from './components/layout/RightCollapsedNav.jsx';
import ChatHistoryModal from './components/chat/ChatHistoryModal.jsx';
import AdminDashboardPage from './components/admin/AdminDashboardPage.jsx';
import AdminProtectedRoute from './components/admin/AdminProtectedRoute.jsx';
import CodeExecutorPage from './components/tools/CodeExecutorPage.jsx';
import StudyPlanPage from './components/learning/StudyPlanPage.jsx';
import QuizGeneratorPage from './components/tools/QuizGeneratorPage.jsx';
import api from './services/api.js';
import toast from 'react-hot-toast';
import { GraduationCap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from './components/core/Button.jsx';

function SessionLoadingModal() {
    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]">
            <motion.div
                key="session-loading-modal"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-2xl p-8 w-full max-w-md text-center"
            >
                <div className="flex justify-center items-center mb-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-b-4 border-primary"></div>
                </div>
                <h2 className="text-xl font-bold text-text-light dark:text-text-dark mb-2">Finalizing Session...</h2>
                <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
                    Summarizing key points and identifying topics for your future recommendations.
                </p>
            </motion.div>
        </div>
    );
}

function MainAppLayout({ 
    orchestratorStatus, 
    handleNewChat, 
    isSessionLoading, 
    messages, 
    setMessages 
}) {
    const { user: regularUser, logout: regularUserLogout } = useRegularAuth();
    const {
        currentSessionId,
        isLeftPanelOpen,
        isRightPanelOpen,
        setSessionId: setGlobalSessionId,
        initialPromptForNewSession,
        setInitialPromptForNewSession,
        initialActivityForNewSession,
        setInitialActivityForNewSession
    } = useAppState();
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [isChatProcessing, setIsChatProcessing] = useState(false);
    
    const handleChatProcessingStatusChange = (isLoading) => {
        setIsChatProcessing(isLoading);
    };

    const handleRegularUserLogout = () => {
        regularUserLogout();
        setGlobalSessionId(null);
    };

    const handleSelectSessionFromHistory = (sessionId) => {
        if (sessionId && sessionId !== currentSessionId) {
            setGlobalSessionId(sessionId);
            toast.success(`Loading session...`);
        }
        setIsHistoryModalOpen(false);
    };

    return (
    <>
        <AnimatePresence>
            {isSessionLoading && <SessionLoadingModal />}
        </AnimatePresence>

        <TopNav 
            user={regularUser} 
            onLogout={handleRegularUserLogout} 
            onNewChat={() => handleNewChat(messages)} // Pass messages to check if current chat is empty
            onHistoryClick={() => setIsHistoryModalOpen(true)} 
            orchestratorStatus={orchestratorStatus}
            isChatProcessing={isChatProcessing}
        />
        <div className="flex flex-1 overflow-hidden pt-16 bg-background-light dark:bg-background-dark">
            <AnimatePresence mode="wait">
                {isLeftPanelOpen ? (
                    <motion.aside key="left-panel-main" initial={{ x: '-100%' }} animate={{ x: '0%' }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="w-full md:w-72 lg:w-80 xl:w-96 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark overflow-y-auto p-3 sm:p-4 shadow-lg flex-shrink-0 custom-scrollbar">
                        <LeftPanel />
                    </motion.aside>
                ) : ( <LeftCollapsedNav /> )}
            </AnimatePresence>
            <main className={`flex-1 flex flex-col overflow-hidden p-1 sm:p-2 md:p-4 transition-all duration-300 ease-in-out ${isLeftPanelOpen ? 'lg:ml-0' : 'lg:ml-16 md:ml-14'} ${isRightPanelOpen ? 'lg:mr-0' : 'lg:mr-16 md:mr-14'}`}>
                <CenterPanel 
                    messages={messages} 
                    setMessages={setMessages} 
                    currentSessionId={currentSessionId}
                    onChatProcessingChange={handleChatProcessingStatusChange}
                    initialPromptForNewSession={initialPromptForNewSession}
                    setInitialPromptForNewSession={setInitialPromptForNewSession}
                    initialActivityForNewSession={initialActivityForNewSession}
                    setInitialActivityForNewSession={setInitialActivityForNewSession}
                />
            </main>
            <AnimatePresence mode="wait">
                {isRightPanelOpen ? (
                    <motion.aside key="right-panel-main" initial={{ x: '100%' }} animate={{ x: '0%' }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className="hidden md:flex md:flex-col md:w-72 lg:w-80 xl:w-96 bg-surface-light dark:bg-surface-dark border-l border-border-light dark:border-border-dark overflow-y-auto p-3 sm:p-4 shadow-lg flex-shrink-0 custom-scrollbar">
                        <RightPanel />
                    </motion.aside>
                ) : ( <RightCollapsedNav /> )}
            </AnimatePresence>
        </div>
        <ChatHistoryModal isOpen={isHistoryModalOpen} onClose={() => setIsHistoryModalOpen(false)} onSelectSession={handleSelectSessionFromHistory} />
    </>
    );
}

function App() {
    const { token: regularUserToken, user: regularUser, loading: regularUserAuthLoading, setUser: setRegularUserInAuthContext } = useRegularAuth();
    const { 
        theme, 
        setSessionId: setGlobalSessionId, 
        currentSessionId, 
        isAdminSessionActive,
    } = useAppState();
    const navigate = useNavigate();
    const location = useLocation();
    const [appInitializing, setAppInitializing] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [orchestratorStatus, setOrchestratorStatus] = useState({ status: "loading", message: "Connecting..." });
    const [isSessionLoading, setIsSessionLoading] = useState(false);
    const [appStateMessages, setAppStateMessages] = useState([]);
    const [isCreatingSession, setIsCreatingSession] = useState(false); // The "lock" state

    const handleNewChat = useCallback(async (callbackOrMessages) => {
        const messages = Array.isArray(callbackOrMessages) ? callbackOrMessages : [];
        const callback = typeof callbackOrMessages === 'function' ? callbackOrMessages : null;

        if (messages.length === 0 && currentSessionId) {
            toast('This is already a new chat!', { icon: '✨' });
            return;
        }
        
        setIsSessionLoading(true);
        try {
            const data = await api.startNewSession(currentSessionId); 
            if (data && data.newSessionId) {
                setGlobalSessionId(data.newSessionId);
                toast.success("New chat started!");

                if (data.studyPlanSuggestion) {
                    const { topic, reason } = data.studyPlanSuggestion;
                    toast.custom((t) => (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="bg-surface-light dark:bg-surface-dark shadow-lg rounded-lg p-4 w-96 border border-border-light dark:border-border-dark"
                        >
                            <div className="flex items-start">
                                <div className="flex-shrink-0 pt-0.5"><GraduationCap className="h-6 w-6 text-primary" /></div>
                                <div className="ml-3 flex-1">
                                    <p className="text-sm font-semibold text-text-light dark:text-text-dark">Personalized Study Plan Suggestion</p>
                                    <p className="mt-1 text-sm text-text-muted-light dark:text-text-muted-dark">{reason}</p>
                                    <div className="mt-4 flex gap-2">
                                        <Button size="sm" onClick={() => { navigate('/study-plan', { state: { prefilledGoal: topic } }); toast.dismiss(t.id); }}>
                                            Create Plan for "{topic}"
                                        </Button>
                                        <Button size="sm" variant="secondary" onClick={() => toast.dismiss(t.id)}>Dismiss</Button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ), { id: `study-plan-toast-${topic}`, duration: Infinity });
                }
                if (callback) callback(data.newSessionId);
            } else {
                toast.error(data.message || "Could not start new chat session.");
            }
        } catch (error) {
            toast.error(`Failed to start new chat: ${error.message}`);
        } finally {
            setIsSessionLoading(false);
        }
    }, [currentSessionId, setGlobalSessionId, navigate]);
    
    const fetchChatHistory = useCallback(async (sid) => {
        if (!sid || !regularUserToken) {
            setAppStateMessages([]);
            return;
        }
        try {
            const sessionData = await api.getChatHistory(sid);
            setAppStateMessages(Array.isArray(sessionData.messages) ? sessionData.messages : []);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.warn("Stale session ID found in localStorage. It will be replaced.");
                localStorage.removeItem('aiTutorSessionId');
                setGlobalSessionId(null);
            } else {
                toast.error(`History load failed: ${error.message}`);
            }
        }
    }, [regularUserToken, setGlobalSessionId]);

    useEffect(() => {
        if (currentSessionId && regularUserToken) {
            fetchChatHistory(currentSessionId);
        } else if (!regularUserToken) {
            setAppStateMessages([]);
        }
    }, [currentSessionId, regularUserToken, fetchChatHistory]);

    useEffect(() => { document.documentElement.className = theme; }, [theme]);
    useEffect(() => { api.getOrchestratorStatus().then(setOrchestratorStatus); }, []);
    
    useEffect(() => {
        const handleAuthAndSession = async () => {
            if (isAdminSessionActive) {
                setAppInitializing(false); setShowAuthModal(false);
                if (!location.pathname.startsWith('/admin')) navigate('/admin/dashboard', { replace: true });
                return;
            }
            if (regularUserAuthLoading) {
                setAppInitializing(true); return;
            }
            setAppInitializing(false);
            
            if (regularUserToken && regularUser) {
                setShowAuthModal(false);
                if (location.pathname.startsWith('/admin')) navigate('/', { replace: true });

                const shouldCreateSession = !currentSessionId && !location.pathname.startsWith('/tools') && !location.pathname.startsWith('/study-plan');
                if (shouldCreateSession && !isCreatingSession) {
                    setIsCreatingSession(true);
                    console.log("[App.jsx] Lock acquired. Creating initial session...");
                    await handleNewChat();
                    setIsCreatingSession(false);
                    console.log("[App.jsx] Initial session created. Lock released.");
                }
            } else if (!location.pathname.startsWith('/admin')) {
                setShowAuthModal(true);
            }
        };
        handleAuthAndSession();
    }, [
        regularUserAuthLoading, regularUserToken, regularUser, isAdminSessionActive, 
        currentSessionId, navigate, location.pathname, handleNewChat, isCreatingSession
    ]);

    const handleAuthSuccess = (authData) => {
        setShowAuthModal(false);
        if (authData && !authData.isAdminLogin && authData.token) {
            // After successful login, we ensure no session ID exists,
            // which will trigger the useEffect above to create one cleanly.
            setGlobalSessionId(null); 
            if (authData.email && authData._id) {
                setRegularUserInAuthContext({ id: authData._id, email: authData.email });
            }
        }
    };

    if (appInitializing) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-background-light dark:bg-background-dark">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen overflow-hidden font-sans">
            <AnimatePresence>
                {showAuthModal && <AuthModal isOpen={showAuthModal} onClose={handleAuthSuccess} />}
            </AnimatePresence>
            <Routes>
                 <Route path="/tools/code-executor" element={(regularUserToken && regularUser) ? <CodeExecutorPage /> : <Navigate to="/" />} />
                 <Route path="/study-plan" element={(regularUserToken && regularUser) ? <StudyPlanPage handleNewChat={handleNewChat} /> : <Navigate to="/" />} />
                 <Route path="/tools/quiz-generator" element={(regularUserToken && regularUser) ? <QuizGeneratorPage /> : <Navigate to="/" />} />
                 <Route path="/admin/dashboard" element={<AdminProtectedRoute><AdminDashboardPage /></AdminProtectedRoute>} />
                 <Route path="/*" element={isAdminSessionActive ? <Navigate to="/admin/dashboard" replace /> : (regularUserToken && regularUser) ? <MainAppLayout 
                    orchestratorStatus={orchestratorStatus} 
                    handleNewChat={handleNewChat} 
                    isSessionLoading={isSessionLoading}
                    messages={appStateMessages}
                    setMessages={setAppStateMessages}
                 /> : null} />
            </Routes>
        </div>
    );
}

function AppWrapper() {
    return (
        <Router>
            <App />
        </Router>
    );
}

export default AppWrapper;