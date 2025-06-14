// // frontend/src/App.jsx
// import React, { useState, useEffect, useCallback } from 'react';
// import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

// import { useAuth as useRegularAuth } from './hooks/useAuth.jsx'; // For regular user login/state
// import { useAppState } from './contexts/AppStateContext.jsx';   // For isAdminSessionActive and other global states

// // --- Regular User Components ---
// import AuthModal from './components/auth/AuthModal.jsx';
// import TopNav from './components/layout/TopNav.jsx';
// import LeftPanel from './components/layout/LeftPanel.jsx';
// import CenterPanel from './components/layout/CenterPanel.jsx';
// import RightPanel from './components/layout/RightPanel.jsx';
// import LeftCollapsedNav from './components/layout/LeftCollapsedNav.jsx';
// import RightCollapsedNav from './components/layout/RightCollapsedNav.jsx';
// import ChatHistoryModal from './components/chat/ChatHistoryModal.jsx';

// // --- Admin Specific Components ---
// import AdminDashboardPage from './components/admin/AdminDashboardPage.jsx'; // Make sure this exists
// import AdminProtectedRoute from './components/admin/AdminProtectedRoute.jsx'; // You've updated this

// // --- Services & Utils ---
// import api from './services/api.js'; // For regular user API calls
// import toast from 'react-hot-toast';
// import { motion, AnimatePresence } from 'framer-motion';

// // Main application layout for authenticated REGULAR users
// function MainAppLayout() {
//     const { user: regularUser, logout: regularUserLogout } = useRegularAuth();
//     const {
//         orchestratorStatus, // Assuming this is fetched and managed by App or AppStateContext
//         currentSessionId,
//         isLeftPanelOpen,
//         isRightPanelOpen,
//         setSessionId: setGlobalSessionId, // Renamed for clarity from AppStateContext
//     } = useAppState();

//     const [appStateMessages, setAppStateMessages] = useState([]); // Local to MainAppLayout
//     const [appStateChatStatus, setAppStateChatStatus] = useState('Ready.'); // Local to MainAppLayout
//     const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

//     const handleRegularUserLogout = () => {
//         regularUserLogout(); // Clears token and user in AuthContext
//         setGlobalSessionId(null); // Clear session from AppStateContext
//         localStorage.removeItem('aiTutorSessionId');
//         setAppStateMessages([]);
//         setAppStateChatStatus("Logged out. Please login.");
//         toast.success("Logged out successfully.");
//         // App.jsx routing will handle redirecting to show AuthModal if necessary
//     };

//     const handleNewChat = async () => {
//         try {
//             // Pass the current session ID to the backend so it can be summarized
//             const data = await api.startNewSession(currentSessionId); 
//             if (data && data.newSessionId) {
//                 setGlobalSessionId(data.newSessionId); // Use the new ID from the backend
//                 setAppStateMessages([]);
//                 setAppStateChatStatus("New chat started.");
//                 toast.success("New chat started!");
//             } else {
//                 toast.error("Could not start new chat session.");
//             }
//         } catch (error) {
//             toast.error(`Failed to start new chat: ${error.message}`);
//         }
//     };

//     const handleSelectSessionFromHistory = (sessionId) => {
//         if (sessionId && sessionId !== currentSessionId) {
//             setGlobalSessionId(sessionId);
//             // Chat history fetching will be triggered by useEffect watching currentSessionId
//             toast.success(`Loading session...`);
//         } else if (sessionId === currentSessionId) {
//             toast.info("This session is already loaded.");
//         }
//         setIsHistoryModalOpen(false);
//     };

//     const { token: regularUserTokenValue } = useRegularAuth(); // Get token for API calls

//     const fetchChatHistory = useCallback(async (sid) => {
//         if (!sid || !regularUserTokenValue) {
//             setAppStateMessages([]);
//             setAppStateChatStatus(regularUserTokenValue ? "Start or select a chat." : "Please login.");
//             return;
//         }
//         setAppStateChatStatus("Loading chat history...");
//         try {
//             // This API call now returns the full session object, including messages
//             const sessionData = await api.getChatHistory(sid);
//             const formattedMessages = (Array.isArray(sessionData.messages) ? sessionData.messages : []).map(msg => ({
//                 id: msg.id || msg._id || String(Math.random() + Date.now()),
//                 sender: msg.sender || (msg.role === 'model' ? 'bot' : 'user'),
//                 text: msg.parts?.[0]?.text || msg.text || '',
//                 thinking: msg.thinking, references: msg.references || [],
//                 timestamp: msg.timestamp || new Date().toISOString(),
//                 source_pipeline: msg.source_pipeline
//             }));
//             setAppStateMessages(formattedMessages);
//             setAppStateChatStatus(formattedMessages.length > 0 ? "History loaded." : "Chat is empty.");
//         } catch (error) {
//             toast.error(`History load failed: ${error.message}`);
//             setAppStateChatStatus("Error loading history.");
//         }
//     }, [regularUserTokenValue]); // Dependencies for fetchChatHistory

//     useEffect(() => {
//         if (currentSessionId && regularUserTokenValue) {
//             fetchChatHistory(currentSessionId);
//         } else if (!regularUserTokenValue) { // If regular user logs out
//             setAppStateMessages([]);
//             setAppStateChatStatus("Please login.");
//         }
//     }, [currentSessionId, regularUserTokenValue, fetchChatHistory]);

//     // Assuming orchestratorStatus is fetched in the top-level App component
//     // and passed down if MainAppLayout needs it directly for TopNav.
//     // For simplicity, I'll pass it as a prop to MainAppLayout.

//     return (
//         <>
//             <TopNav
//                 user={regularUser} // regularUser object from AuthContext (includes role if backend sends it)
//                 onLogout={handleRegularUserLogout}
//                 onNewChat={handleNewChat}
//                 onHistoryClick={() => setIsHistoryModalOpen(true)}
//                 orchestratorStatus={orchestratorStatus}
//             />
//             <div className="flex flex-1 overflow-hidden pt-16 bg-background-light dark:bg-background-dark">
//                 <AnimatePresence mode="wait">
//                     {isLeftPanelOpen ? (
//                         <motion.aside
//                             key="left-panel-main"
//                             initial={{ x: '-100%', opacity: 0 }}
//                             animate={{ x: '0%', opacity: 1 }}
//                             exit={{ x: '-100%', opacity: 0 }}
//                             transition={{ type: 'spring', stiffness: 300, damping: 30 }}
//                             className="w-full md:w-72 lg:w-80 xl:w-96 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark overflow-y-auto p-3 sm:p-4 shadow-lg flex-shrink-0 custom-scrollbar"
//                         >
//                             <LeftPanel />
//                         </motion.aside>
//                     ) : (
//                         <LeftCollapsedNav />
//                     )}
//                 </AnimatePresence>

//                 <main className={`flex-1 flex flex-col overflow-hidden p-1 sm:p-2 md:p-4
//                                  transition-all duration-300 ease-in-out
//                                  ${isLeftPanelOpen ? 'lg:ml-0' : 'lg:ml-16 md:ml-14'}
//                                  ${isRightPanelOpen ? 'lg:mr-0' : 'lg:mr-16 md:mr-14'}`}>
//                     <CenterPanel
//                         messages={appStateMessages}
//                         setMessages={setAppStateMessages}
//                         currentSessionId={currentSessionId}
//                         chatStatus={appStateChatStatus}
//                         setChatStatus={setAppStateChatStatus}
//                     />
//                 </main>

//                 <AnimatePresence mode="wait">
//                     {isRightPanelOpen ? (
//                         <motion.aside
//                             key="right-panel-main"
//                             initial={{ x: '100%', opacity: 0 }}
//                             animate={{ x: '0%', opacity: 1 }}
//                             exit={{ x: '100%', opacity: 0 }}
//                             transition={{ type: 'spring', stiffness: 300, damping: 30 }}
//                             className="hidden md:flex md:flex-col md:w-72 lg:w-80 xl:w-96 bg-surface-light dark:bg-surface-dark border-l border-border-light dark:border-border-dark overflow-y-auto p-3 sm:p-4 shadow-lg flex-shrink-0 custom-scrollbar"
//                         >
//                             <RightPanel />
//                         </motion.aside>
//                     ) : (
//                         <RightCollapsedNav />
//                     )}
//                 </AnimatePresence>
//             </div>
//             <ChatHistoryModal
//                 isOpen={isHistoryModalOpen}
//                 onClose={() => setIsHistoryModalOpen(false)}
//                 onSelectSession={handleSelectSessionFromHistory}
//             />
//         </>
//     );
// }


// // Main App Component - Handles top-level routing and auth state logic
// function App() {
//     const { token: regularUserToken, user: regularUser, loading: regularUserAuthLoading, setUser: setRegularUserInAuthContext } = useRegularAuth();
//     const { theme, setSessionId: setGlobalSessionId, currentSessionId, isAdminSessionActive } = useAppState(); // Removed setIsAdminSessionActive as it's set by AuthModal

//     const navigate = useNavigate();
//     const location = useLocation();

//     const [appInitializing, setAppInitializing] = useState(true);
//     const [showAuthModal, setShowAuthModal] = useState(false);
//     const [orchestratorStatus, setOrchestratorStatus] = useState({ status: "loading", message: "Connecting..." });

//     // Effect for theme
//     useEffect(() => {
//         const rootHtmlElement = document.documentElement;
//         rootHtmlElement.classList.remove('light', 'dark');
//         rootHtmlElement.classList.add(theme);
//         document.body.className = '';
//         document.body.classList.add(theme === 'dark' ? 'bg-background-dark' : 'bg-background-light');
//     }, [theme]);

//     // Effect for orchestrator status
//     useEffect(() => {
//         api.getOrchestratorStatus().then(setOrchestratorStatus);
//     }, []);

//     // Effect for Authentication, Initialization, and Routing
//     useEffect(() => {
//         // console.log("App.jsx: Auth/Init Effect | regularUserAuthLoading:", regularUserAuthLoading, "| regularUserToken:", !!regularUserToken, "| regularUser:", regularUser, "| isAdminSessionActive:", isAdminSessionActive, "| Path:", location.pathname);

//         // Prioritize admin session: if active, ensure they are on admin path
//         if (isAdminSessionActive) {
//             setAppInitializing(false); // Ensure loader is hidden
//             setShowAuthModal(false);
//             if (!location.pathname.startsWith('/admin')) {
//                 navigate('/admin/dashboard', { replace: true });
//             }
//             return;
//         }

//         // If admin session is not active, proceed with regular user auth logic
//         if (regularUserAuthLoading) {
//             // console.log("App.jsx: Regular user auth is loading...");
//             setAppInitializing(true); // Show loader while regular auth context determines state
//             return;
//         }

//         setAppInitializing(false); // Regular auth has finished loading

//         if (regularUserToken && regularUser) {
//             // Regular user is authenticated
//             setShowAuthModal(false);
//             if (location.pathname.startsWith('/admin')) {
//                 // A regular user tried to access an admin path, redirect them
//                 // console.log("App.jsx: Regular user on admin path, redirecting to /");
//                 navigate('/', { replace: true });
//             } else if (!currentSessionId && !location.pathname.startsWith('/admin')) { // Only start session if not on admin path
//                 // console.log("App.jsx: Regular user logged in, no session, starting new one.");
//                 api.startNewSession(null).then(data => { // Pass null for no previous session
//                     if (data && data.newSessionId) {
//                         setGlobalSessionId(data.newSessionId);
//                     }
//                 }).catch(err => {
//                     toast.error("Failed to start initial session.");
//                     console.error("App.jsx: Error starting initial session:", err);
//                 });
//             }
//         } else {
//             // No regular user token/user, and not an admin session
//             if (!location.pathname.startsWith('/admin')) {
//                 setShowAuthModal(true);
//             }
//         }
//     }, [
//         regularUserAuthLoading, regularUserToken, regularUser,
//         isAdminSessionActive,
//         currentSessionId, setGlobalSessionId,
//         navigate, location.pathname
//     ]);

//     const handleAuthSuccess = (authDataFromModal) => {
//         setShowAuthModal(false);
//         if (authDataFromModal && !authDataFromModal.isAdminLogin && authDataFromModal.token) {
//             // For a regular user, start a completely fresh session on successful login
//             api.startNewSession(null).then(data => { // Pass null, as there's no previous session to summarize
//                 if (data && data.newSessionId) {
//                     setGlobalSessionId(data.newSessionId);
//                 }
//             });
//             if (authDataFromModal.username && authDataFromModal._id && authDataFromModal.role) {
//                 setRegularUserInAuthContext({
//                     id: authDataFromModal._id,
//                     username: authDataFromModal.username,
//                     role: authDataFromModal.role
//                 });
//             }
//         } else if (authDataFromModal && authDataFromModal.isAdminLogin) {
//             // Admin "login" handled by AuthModal. useEffect will handle navigation.
//         }
//     };

//     if (appInitializing) {
//         return (
//             <div className="fixed inset-0 flex flex-col items-center justify-center bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark">
//                 <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary mb-4"></div>
//                 <p className="text-xl">Initializing AI Tutor...</p>
//             </div>
//         );
//     }

//     return (
//         <div className={`flex flex-col h-screen overflow-hidden font-sans ${theme}`}>
//             <AnimatePresence>
//                 {showAuthModal && !regularUserToken && !isAdminSessionActive && !location.pathname.startsWith('/admin') && (
//                     <AuthModal isOpen={showAuthModal} onClose={handleAuthSuccess} />
//                 )}
//             </AnimatePresence>

//             <Routes>
//                 <Route path="/admin/dashboard" element={
//                     <AdminProtectedRoute>
//                         <AdminDashboardPage />
//                     </AdminProtectedRoute>
//                 } />

//                 <Route path="/*" element={
//                     isAdminSessionActive ? <Navigate to="/admin/dashboard" replace /> :
//                         (regularUserToken && regularUser) ? <MainAppLayout orchestratorStatus={orchestratorStatus} /> :
//                             (location.pathname.startsWith('/admin')) ? <Navigate to="/" replace /> :
//                                 null
//                 } />
//             </Routes>
//         </div>
//     );
// }

// // AppWrapper to provide Router context
// function AppWrapper() {
//     return (
//         <Router>
//             <App />
//         </Router>
//     );
// }

// export default AppWrapper;






// frontend/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

import { useAuth as useRegularAuth } from './hooks/useAuth.jsx';
import { useAppState } from './contexts/AppStateContext.jsx';

// --- Components ---
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

// --- Services & Utils ---
import api from './services/api.js';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

// --- FIX: MainAppLayout now correctly receives orchestratorStatus as a prop ---
function MainAppLayout({ orchestratorStatus }) {
    const { user: regularUser, logout: regularUserLogout } = useRegularAuth();
    
    // --- FIX: Removed orchestratorStatus from here, as it comes from props ---
    const {
        currentSessionId,
        isLeftPanelOpen,
        isRightPanelOpen,
        setSessionId: setGlobalSessionId,
    } = useAppState();

    const [appStateMessages, setAppStateMessages] = useState([]);
    const [appStateChatStatus, setAppStateChatStatus] = useState('Ready.');
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    const handleRegularUserLogout = () => {
        regularUserLogout();
        setGlobalSessionId(null);
        localStorage.removeItem('aiTutorSessionId');
        setAppStateMessages([]);
        setAppStateChatStatus("Logged out. Please login.");
        toast.success("Logged out successfully.");
    };

    const handleNewChat = async () => {
        try {
            const data = await api.startNewSession(currentSessionId); 
            if (data && data.newSessionId) {
                setGlobalSessionId(data.newSessionId);
                setAppStateMessages([]);
                setAppStateChatStatus("New chat started.");
                toast.success("New chat started!");
            } else {
                toast.error("Could not start new chat session.");
            }
        } catch (error) {
            toast.error(`Failed to start new chat: ${error.message}`);
        }
    };

    const handleSelectSessionFromHistory = (sessionId) => {
        if (sessionId && sessionId !== currentSessionId) {
            setGlobalSessionId(sessionId);
            toast.success(`Loading session...`);
        } else if (sessionId === currentSessionId) {
            toast.info("This session is already loaded.");
        }
        setIsHistoryModalOpen(false);
    };

    const { token: regularUserTokenValue } = useRegularAuth();

    const fetchChatHistory = useCallback(async (sid) => {
        if (!sid || !regularUserTokenValue) {
            setAppStateMessages([]);
            setAppStateChatStatus(regularUserTokenValue ? "Start or select a chat." : "Please login.");
            return;
        }
        setAppStateChatStatus("Loading chat history...");
        try {
            const sessionData = await api.getChatHistory(sid);
            const formattedMessages = (Array.isArray(sessionData.messages) ? sessionData.messages : []).map(msg => ({
                id: msg.id || msg._id || String(Math.random() + Date.now()),
                sender: msg.sender || (msg.role === 'model' ? 'bot' : 'user'),
                text: msg.parts?.[0]?.text || msg.text || '',
                thinking: msg.thinking, references: msg.references || [],
                timestamp: msg.timestamp || new Date().toISOString(),
                source_pipeline: msg.source_pipeline
            }));
            setAppStateMessages(formattedMessages);
            setAppStateChatStatus(formattedMessages.length > 0 ? "History loaded." : "Chat is empty.");
        } catch (error) {
            toast.error(`History load failed: ${error.message}`);
            setAppStateChatStatus("Error loading history.");
        }
    }, [regularUserTokenValue]);

    useEffect(() => {
        if (currentSessionId && regularUserTokenValue) {
            fetchChatHistory(currentSessionId);
        } else if (!regularUserTokenValue) {
            setAppStateMessages([]);
            setAppStateChatStatus("Please login.");
        }
    }, [currentSessionId, regularUserTokenValue, fetchChatHistory]);

    return (
        <>
            <TopNav
                user={regularUser}
                onLogout={handleRegularUserLogout}
                onNewChat={handleNewChat}
                onHistoryClick={() => setIsHistoryModalOpen(true)}
                orchestratorStatus={orchestratorStatus} // This prop is now correctly passed down
            />
            <div className="flex flex-1 overflow-hidden pt-16 bg-background-light dark:bg-background-dark">
                <AnimatePresence mode="wait">
                    {isLeftPanelOpen ? (
                        <motion.aside
                            key="left-panel-main"
                            initial={{ x: '-100%', opacity: 0 }}
                            animate={{ x: '0%', opacity: 1 }}
                            exit={{ x: '-100%', opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="w-full md:w-72 lg:w-80 xl:w-96 bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark overflow-y-auto p-3 sm:p-4 shadow-lg flex-shrink-0 custom-scrollbar"
                        >
                            <LeftPanel />
                        </motion.aside>
                    ) : (
                        <LeftCollapsedNav />
                    )}
                </AnimatePresence>

                <main className={`flex-1 flex flex-col overflow-hidden p-1 sm:p-2 md:p-4
                                 transition-all duration-300 ease-in-out
                                 ${isLeftPanelOpen ? 'lg:ml-0' : 'lg:ml-16 md:ml-14'}
                                 ${isRightPanelOpen ? 'lg:mr-0' : 'lg:mr-16 md:mr-14'}`}>
                    <CenterPanel
                        messages={appStateMessages}
                        setMessages={setAppStateMessages}
                        currentSessionId={currentSessionId}
                        chatStatus={appStateChatStatus}
                        setChatStatus={setAppStateChatStatus}
                    />
                </main>

                <AnimatePresence mode="wait">
                    {isRightPanelOpen ? (
                        <motion.aside
                            key="right-panel-main"
                            initial={{ x: '100%', opacity: 0 }}
                            animate={{ x: '0%', opacity: 1 }}
                            exit={{ x: '100%', opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            className="hidden md:flex md:flex-col md:w-72 lg:w-80 xl:w-96 bg-surface-light dark:bg-surface-dark border-l border-border-light dark:border-border-dark overflow-y-auto p-3 sm:p-4 shadow-lg flex-shrink-0 custom-scrollbar"
                        >
                            <RightPanel />
                        </motion.aside>
                    ) : (
                        <RightCollapsedNav />
                    )}
                </AnimatePresence>
            </div>
            <ChatHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                onSelectSession={handleSelectSessionFromHistory}
            />
        </>
    );
}

// Main App Component - Handles top-level routing and auth state logic
function App() {
    const { token: regularUserToken, user: regularUser, loading: regularUserAuthLoading, setUser: setRegularUserInAuthContext } = useRegularAuth();
    const { theme, setSessionId: setGlobalSessionId, currentSessionId, isAdminSessionActive } = useAppState();

    const navigate = useNavigate();
    const location = useLocation();

    const [appInitializing, setAppInitializing] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [orchestratorStatus, setOrchestratorStatus] = useState({ status: "loading", message: "Connecting..." });

    useEffect(() => {
        const rootHtmlElement = document.documentElement;
        rootHtmlElement.classList.remove('light', 'dark');
        rootHtmlElement.classList.add(theme);
        document.body.className = '';
        document.body.classList.add(theme === 'dark' ? 'bg-background-dark' : 'bg-background-light');
    }, [theme]);

    useEffect(() => {
        api.getOrchestratorStatus().then(setOrchestratorStatus);
    }, []);

    useEffect(() => {
        if (isAdminSessionActive) {
            setAppInitializing(false);
            setShowAuthModal(false);
            if (!location.pathname.startsWith('/admin')) {
                navigate('/admin/dashboard', { replace: true });
            }
            return;
        }

        if (regularUserAuthLoading) {
            setAppInitializing(true);
            return;
        }

        setAppInitializing(false);

        if (regularUserToken && regularUser) {
            setShowAuthModal(false);
            if (location.pathname.startsWith('/admin')) {
                navigate('/', { replace: true });
            } else if (!currentSessionId && !location.pathname.startsWith('/admin')) {
                api.startNewSession(null).then(data => {
                    if (data && data.newSessionId) {
                        setGlobalSessionId(data.newSessionId);
                    }
                }).catch(err => {
                    toast.error("Failed to start initial session.");
                    console.error("App.jsx: Error starting initial session:", err);
                });
            }
        } else {
            if (!location.pathname.startsWith('/admin')) {
                setShowAuthModal(true);
            }
        }
    }, [
        regularUserAuthLoading, regularUserToken, regularUser,
        isAdminSessionActive,
        currentSessionId, setGlobalSessionId,
        navigate, location.pathname
    ]);

    const handleAuthSuccess = (authDataFromModal) => {
        setShowAuthModal(false);
        if (authDataFromModal && !authDataFromModal.isAdminLogin && authDataFromModal.token) {
            api.startNewSession(null).then(data => {
                if (data && data.newSessionId) {
                    setGlobalSessionId(data.newSessionId);
                }
            });
            if (authDataFromModal.username && authDataFromModal._id && authDataFromModal.role) {
                setRegularUserInAuthContext({
                    id: authDataFromModal._id,
                    username: authDataFromModal.username,
                    role: authDataFromModal.role
                });
            }
        }
    };

    if (appInitializing) {
        return (
            <div className="fixed inset-0 flex flex-col items-center justify-center bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary mb-4"></div>
                <p className="text-xl">Initializing AI Tutor...</p>
            </div>
        );
    }

    return (
        <div className={`flex flex-col h-screen overflow-hidden font-sans ${theme}`}>
            <AnimatePresence>
                {showAuthModal && !regularUserToken && !isAdminSessionActive && !location.pathname.startsWith('/admin') && (
                    <AuthModal isOpen={showAuthModal} onClose={handleAuthSuccess} />
                )}
            </AnimatePresence>

            <Routes>
                <Route path="/admin/dashboard" element={
                    <AdminProtectedRoute>
                        <AdminDashboardPage />
                    </AdminProtectedRoute>
                } />

                <Route path="/*" element={
                    isAdminSessionActive ? <Navigate to="/admin/dashboard" replace /> :
                        (regularUserToken && regularUser) ? <MainAppLayout orchestratorStatus={orchestratorStatus} /> :
                            (location.pathname.startsWith('/admin')) ? <Navigate to="/" replace /> :
                                null
                } />
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