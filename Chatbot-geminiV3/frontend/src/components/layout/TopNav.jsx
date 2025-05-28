// import React, { useState } from 'react';
// import { useAuth } from '../../hooks/useAuth';
// import { useAppState } from '../../contexts/AppStateContext';
// import ThemeToggle from '../common/ThemeToggle';
// import { LogOut, User, MessageSquare, History, Settings, Cpu, Zap, ServerCrash, Server } from 'lucide-react'; // Cpu for LLM, Zap for Online, ServerCrash for Offline
// import LLMSelectionModal from './LLMSelectionModal'; // New component for LLM switching

// function TopNav({ onNewChat, onHistoryClick, orchestratorStatus }) {
//     const { user, logout } = useAuth();
//     const { selectedLLM, switchLLM, setIsLeftPanelOpen, setIsRightPanelOpen, isLeftPanelOpen, isRightPanelOpen } = useAppState();
//     const [isLLMModalOpen, setIsLLMModalOpen] = useState(false);
    
//     const getStatusIndicator = () => {
//         if (orchestratorStatus.status === "ok") {
//             return <Zap size={18} className="text-green-400 animate-pulse" title="Backend Online" />;
//         } else if (orchestratorStatus.status === "loading") {
//             return <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-yellow-400" title="Connecting..."></div>;
//         } else {
//             return <ServerCrash size={18} className="text-red-400" title={`Backend Offline: ${orchestratorStatus.message}`} />;
//         }
//     };

//     return (
//         <>
//             <nav className="fixed top-0 left-0 right-0 z-40 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700 shadow-sm h-16 flex items-center justify-between px-4 sm:px-6">
//                 {/* Left Side: Branding & Panel Toggles */}
//                 <div className="flex items-center gap-2">
//                      <button 
//                         onClick={() => setIsLeftPanelOpen(prev => !prev)} 
//                         className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 lg:hidden"
//                         title={isLeftPanelOpen ? "Close Assistant Panel" : "Open Assistant Panel"} 
//                         aria-label="Toggle Assistant Panel"
//                     >
//                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isLeftPanelOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h7"}></path></svg>
//                     </button>
//                     <a href="/" className="flex items-center gap-2 text-xl font-semibold text-text-light dark:text-text-dark">
//                         {/* Replace with your logo if you have one */}
//                         <Server size={28} className="text-primary dark:text-primary-light" />
//                         <span>AI Tutor</span>
//                     </a>
//                 </div>

//                 {/* Center Controls */}
//                 <div className="hidden md:flex items-center gap-2">
//                     <button
//                         onClick={onNewChat}
//                         className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
//                         title="Start a new chat session"
//                     >
//                         <MessageSquare size={16} /> New Chat
//                     </button>
//                     <button
//                         onClick={onHistoryClick}
//                         className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
//                         title="View chat history (Coming Soon)"
//                     >
//                         <History size={16} /> History
//                     </button>
//                     <button
//                         onClick={() => setIsLLMModalOpen(true)}
//                         className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
//                         title={`Switch LLM (Current: ${selectedLLM.toUpperCase()})`}
//                     >
//                         <Cpu size={16} /> {selectedLLM.toUpperCase()}
//                     </button>
//                 </div>

//                 {/* Right Side: Theme, User, Logout */}
//                 <div className="flex items-center gap-2 sm:gap-3">
//                     {getStatusIndicator()}
//                     <ThemeToggle />
//                     <div className="relative group">
//                         <button className="p-1.5 bg-primary-light dark:bg-primary-dark text-white rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark focus:ring-primary">
//                             <User size={20} />
//                         </button>
//                         <div className="absolute right-0 mt-2 w-48 bg-surface-light dark:bg-surface-dark rounded-md shadow-lg py-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 ease-in-out transform scale-95 group-hover:scale-100 focus-within:scale-100 origin-top-right invisible group-hover:visible focus-within:visible">
//                             <div className="px-4 py-2 text-sm text-text-light dark:text-text-dark border-b border-gray-200 dark:border-gray-600">
//                                 Signed in as <br/><strong>{user?.username || 'User'}</strong>
//                             </div>
//                             <button
//                                 onClick={() => { /* TODO: User Profile/Settings Modal */ toast.info("Profile settings coming soon!"); }}
//                                 className="w-full text-left px-4 py-2 text-sm text-text-light dark:text-text-dark hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
//                             >
//                                 <Settings size={16} /> Profile
//                             </button>
//                             <button
//                                 onClick={logout}
//                                 className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 flex items-center gap-2"
//                             >
//                                 <LogOut size={16} /> Logout
//                             </button>
//                         </div>
//                     </div>
//                      <button 
//                         onClick={() => setIsRightPanelOpen(prev => !prev)} 
//                         className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 lg:hidden"
//                         title={isRightPanelOpen ? "Close Analyzer Panel" : "Open Analyzer Panel"} 
//                         aria-label="Toggle Analyzer Panel"
//                     >
//                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isRightPanelOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h7m-7 6h16"}></path></svg>
//                     </button>
//                 </div>
//             </nav>
//             <LLMSelectionModal 
//                 isOpen={isLLMModalOpen} 
//                 onClose={() => setIsLLMModalOpen(false)} 
//                 currentLLM={selectedLLM}
//                 onSelectLLM={(llm) => {
//                     switchLLM(llm);
//                     setIsLLMModalOpen(false);
//                 }}
//             />
//         </>
//     );
// }
// export default TopNav;

// import React, { useState } from 'react';
// import { useAuth } from '../../hooks/useAuth';
// import { useAppState } from '../../contexts/AppStateContext';
// import ThemeToggle from '../common/ThemeToggle';
// import LLMSelectionModal from './LLMSelectionModal';
// import { 
//     LogOut, User, MessageSquare, History as HistoryIcon, Settings, Cpu, Zap, ServerCrash, Server, 
//     PanelLeftClose, PanelRightClose, PanelLeftOpen, PanelRightOpen, Menu // Lucide icons
// } from 'lucide-react';
// import toast from 'react-hot-toast'; // For placeholder actions

// function TopNav({ onNewChat, onHistoryClick, orchestratorStatus }) {
//     const { user, logout } = useAuth();
//     const { 
//         selectedLLM, switchLLM, 
//         isLeftPanelOpen, setIsLeftPanelOpen,
//         isRightPanelOpen, setIsRightPanelOpen
//     } = useAppState();
    
//     const [isLLMModalOpen, setIsLLMModalOpen] = useState(false);
    
//     const getStatusIndicator = () => {
//         if (!orchestratorStatus) return <div title="Status unavailable" className="w-4 h-4 bg-gray-400 rounded-full"></div>;
//         if (orchestratorStatus.status === "ok") {
//             return <Zap size={18} className="text-green-400 animate-pulse" title="Backend Online" />;
//         } else if (orchestratorStatus.status === "loading") {
//             return <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-yellow-400" title="Connecting..."></div>;
//         } else {
//             return <ServerCrash size={18} className="text-red-400" title={`Backend Offline: ${orchestratorStatus.message}`} />;
//         }
//     };

//     return (
//         <>
//             <nav className="fixed top-0 left-0 right-0 z-40 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700 shadow-sm h-16 flex items-center justify-between px-2 sm:px-4">
//                 {/* Left Side: Panel Toggle & Branding */}
//                 <div className="flex items-center gap-2">
//                     <button 
//                         onClick={() => setIsLeftPanelOpen(prev => !prev)} 
//                         className="p-2 rounded-md text-text-muted-light dark:text-text-muted-dark hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
//                         title={isLeftPanelOpen ? "Hide Assistant Panel" : "Show Assistant Panel"} 
//                         aria-label="Toggle Assistant Panel"
//                     >
//                         {isLeftPanelOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
//                     </button>
//                     <a href="/" className="flex items-center gap-1.5 sm:gap-2 text-lg sm:text-xl font-semibold text-text-light dark:text-text-dark">
//                         <Server size={24} className="text-primary dark:text-primary-light" />
//                         <span className="hidden sm:inline">AI Tutor</span>
//                     </a>
//                 </div>

//                 {/* Center Controls - More adaptive */}
//                 <div className="flex-1 flex justify-center px-2">
//                     <div className="flex items-center gap-1 sm:gap-2">
//                         <button
//                             onClick={onNewChat}
//                             className="flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
//                             title="Start a new chat session"
//                         >
//                             <MessageSquare size={14} /> <span className="hidden sm:inline">New Chat</span>
//                         </button>
//                         <button
//                             onClick={onHistoryClick}
//                             className="flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
//                             title="View chat history (Coming Soon)"
//                         >
//                             <HistoryIcon size={14} /> <span className="hidden sm:inline">History</span>
//                         </button>
//                         <button
//                             onClick={() => setIsLLMModalOpen(true)}
//                             className="flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
//                             title={`Switch LLM (Current: ${selectedLLM.toUpperCase()})`}
//                         >
//                             <Cpu size={14} /> <span className="hidden xs:inline">{selectedLLM.toUpperCase()}</span>
//                         </button>
//                     </div>
//                 </div>


//                 {/* Right Side: Status, Theme, User, Panel Toggle */}
//                 <div className="flex items-center gap-1.5 sm:gap-2">
//                     {getStatusIndicator()}
//                     <ThemeToggle />
//                     <div className="relative group">
//                         <button className="p-1.5 bg-primary-light dark:bg-primary-dark text-white rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark focus:ring-primary">
//                             <User size={18} />
//                         </button>
//                         <div className="absolute right-0 mt-2 w-48 bg-surface-light dark:bg-surface-dark rounded-md shadow-lg py-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 ease-in-out transform scale-95 group-hover:scale-100 focus-within:scale-100 origin-top-right invisible group-hover:visible focus-within:visible z-50">
//                             <div className="px-4 py-2 text-sm text-text-light dark:text-text-dark border-b border-gray-200 dark:border-gray-600">
//                                 Signed in as <br/><strong>{user?.username || 'User'}</strong>
//                             </div>
//                             <button
//                                 onClick={() => toast.info("Profile settings coming soon!")}
//                                 className="w-full text-left px-4 py-2 text-sm text-text-light dark:text-text-dark hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
//                             >
//                                 <Settings size={16} /> Profile
//                             </button>
//                             <button
//                                 onClick={logout}
//                                 className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 flex items-center gap-2"
//                             >
//                                 <LogOut size={16} /> Logout
//                             </button>
//                         </div>
//                     </div>
//                     <button 
//                         onClick={() => setIsRightPanelOpen(prev => !prev)} 
//                         className="p-2 rounded-md text-text-muted-light dark:text-text-muted-dark hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
//                         title={isRightPanelOpen ? "Hide Analyzer Panel" : "Show Analyzer Panel"} 
//                         aria-label="Toggle Analyzer Panel"
//                     >
//                         {isRightPanelOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
//                     </button>
//                 </div>
//             </nav>
//             <LLMSelectionModal 
//                 isOpen={isLLMModalOpen} 
//                 onClose={() => setIsLLMModalOpen(false)} 
//                 currentLLM={selectedLLM}
//                 onSelectLLM={(llm) => { // This callback is passed to the modal
//                     switchLLM(llm); // Update global state via AppStateContext
//                     // The modal will also call its own API to save this preference
//                     setIsLLMModalOpen(false);
//                 }}
//             />
//         </>
//     );
// }
// export default TopNav;












// frontend/src/components/layout/TopNav.jsx
import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAppState } from '../../contexts/AppStateContext';
import ThemeToggle from '../common/ThemeToggle.jsx';
import LLMSelectionModal from './LLMSelectionModal.jsx';
import { 
    LogOut, User, MessageSquare, History as HistoryIcon, Settings, Cpu, Zap, ServerCrash, Server 
} from 'lucide-react';
import toast from 'react-hot-toast';

function TopNav({ onNewChat, onHistoryClick, orchestratorStatus }) {
    const { user, logout } = useAuth();
    const { selectedLLM, switchLLM } = useAppState(); // Panels are NOT controlled from here
    const [isLLMModalOpen, setIsLLMModalOpen] = useState(false);
    
    const getStatusIndicator = () => { /* ... as provided before ... */ };

    return (
        <>
            <nav className="fixed top-0 left-0 right-0 z-40 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark shadow-sm h-16 flex items-center justify-between px-2 sm:px-4">
                {/* Left Side: Branding (No panel toggle here) */}
                <div className="flex items-center gap-2">
                    <a href="/" className="flex items-center gap-1.5 sm:gap-2 text-lg sm:text-xl font-semibold text-text-light dark:text-text-dark">
                        <Server size={24} className="text-primary dark:text-primary-light" />
                        <span className="hidden sm:inline">AI Tutor</span>
                    </a>
                </div>

                {/* Center Controls */}
                <div className="flex-1 flex justify-center px-2">
                    <div className="flex items-center gap-1 sm:gap-2">
                        {/* New Chat, History, LLM buttons as before */}
                         <button
                            onClick={onNewChat}
                            className="flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            title="Start a new chat session"
                        >
                            <MessageSquare size={14} /> <span className="hidden sm:inline">New Chat</span>
                        </button>
                        <button
                            onClick={onHistoryClick}
                            className="flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            title="View chat history"
                        >
                            <HistoryIcon size={14} /> <span className="hidden sm:inline">History</span>
                        </button>
                        <button
                            onClick={() => setIsLLMModalOpen(true)}
                            className="flex items-center gap-1 px-2 py-1.5 text-xs sm:text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            title={`Switch LLM (Current: ${selectedLLM.toUpperCase()})`}
                        >
                            <Cpu size={14} /> <span className="hidden xs:inline">{selectedLLM.toUpperCase()}</span>
                        </button>
                    </div>
                </div>

                {/* Right Side: Status, Theme, User (No panel toggle here) */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                    {getStatusIndicator()}
                    <ThemeToggle />
                    <div className="relative group">
                        <button className="p-1.5 bg-primary-light dark:bg-primary-dark text-white rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-light dark:focus:ring-offset-surface-dark focus:ring-primary">
                            <User size={18} />
                        </button>
                        {/* User Dropdown Menu */}
                        <div className="absolute right-0 mt-2 w-48 bg-surface-light dark:bg-surface-dark rounded-md shadow-lg py-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 ease-in-out transform scale-95 group-hover:scale-100 focus-within:scale-100 origin-top-right invisible group-hover:visible focus-within:visible z-50">
                            <div className="px-4 py-2 text-sm text-text-light dark:text-text-dark border-b border-border-light dark:border-border-dark">
                                Signed in as <br/><strong>{user?.username || 'User'}</strong>
                            </div>
                            <button
                                onClick={() => toast.info("Profile settings coming soon!")}
                                className="w-full text-left px-4 py-2 text-sm text-text-light dark:text-text-dark hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                            >
                                <Settings size={16} /> Profile
                            </button>
                            <button
                                onClick={logout}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 flex items-center gap-2"
                            >
                                <LogOut size={16} /> Logout
                            </button>
                        </div>
                    </div>
                </div>
            </nav>
            <LLMSelectionModal 
                isOpen={isLLMModalOpen} 
                onClose={() => setIsLLMModalOpen(false)} 
                currentLLM={selectedLLM}
                onSelectLLM={(llm) => {
                    switchLLM(llm);
                    setIsLLMModalOpen(false);
                }}
            />
        </>
    );
}
export default TopNav;


