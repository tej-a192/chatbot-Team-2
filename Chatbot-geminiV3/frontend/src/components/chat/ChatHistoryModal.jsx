import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { X, MessageSquareText, Loader2, AlertTriangle } from 'lucide-react';
import Modal from '../core/Modal.jsx'; // Assuming your generic Modal component

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleString(undefined, { 
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
    } catch (e) {
        return 'Invalid Date';
    }
};

function ChatHistoryModal({ isOpen, onClose, onSelectSession }) {
    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const [sessionMessages, setSessionMessages] = useState([]);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [error, setError] = useState('');

    const fetchSessions = useCallback(async () => {
        if (!isOpen) return; 
        setLoadingSessions(true);
        setError('');
        try {
            const data = await api.getChatSessions(); 
            setSessions(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error("Failed to load chat sessions.");
            setError(err.message || "Could not fetch sessions.");
        } finally {
            setLoadingSessions(false);
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) { // Only fetch when modal becomes open
            fetchSessions();
            setSelectedSessionId(null); // Reset selection when modal reopens
            setSessionMessages([]);
        }
    }, [isOpen, fetchSessions]); 

    const handleSessionSelect = async (sessionId) => {
        if (selectedSessionId === sessionId) return; // Avoid re-fetching if already selected

        setSelectedSessionId(sessionId);
        setLoadingMessages(true);
        setSessionMessages([]);
        setError(''); 
        try {
            const historyData = await api.getChatHistory(sessionId);
            setSessionMessages((Array.isArray(historyData) ? historyData : []).map(msg => ({
                id: msg.id || msg._id || String(Math.random() + Date.now()),
                sender: msg.role === 'model' ? 'bot' : 'user',
                text: msg.parts && msg.parts.length > 0 ? msg.parts[0].text : (msg.text || ''),
                timestamp: msg.timestamp
            })));
        } catch (err) {
            toast.error("Failed to load messages for this session.");
            setError(`Error loading messages: ${err.message}`);
        } finally {
            setLoadingMessages(false);
        }
    };

    const handleLoadSessionAndClose = () => {
        if (selectedSessionId) {
            onSelectSession(selectedSessionId); 
            onClose();
        } else {
            toast.error("Please select a session to load.");
        }
    };
    
    // Placeholder for delete functionality
    // const handleDeleteSession = async (sessionIdToDelete, e) => { ... };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Chat History" size="2xl">
            <div className="flex flex-col md:flex-row gap-4 max-h-[70vh] h-[70vh]">
                {/* Sessions List */}
                <div className="w-full md:w-1/3 border-r border-border-light dark:border-border-dark pr-0 md:pr-2 overflow-y-auto custom-scrollbar">
                    <h3 className="text-sm font-semibold mb-2 text-text-light dark:text-text-dark px-1">Sessions</h3>
                    {loadingSessions && <div className="flex justify-center p-4"><Loader2 className="animate-spin text-primary" size={24}/></div>}
                    {!loadingSessions && error && !sessions.length && <div className="text-red-500 text-xs p-2">{error}</div>}
                    {!loadingSessions && !error && sessions.length === 0 && <p className="text-xs text-text-muted-light dark:text-text-muted-dark p-2">No past sessions found.</p>}
                    
                    <ul className="space-y-1">
                        {sessions.map(session => (
                            <li key={session.sessionId}
                                onClick={() => handleSessionSelect(session.sessionId)}
                                className={`p-2.5 rounded-md cursor-pointer text-xs transition-colors group relative
                                            ${selectedSessionId === session.sessionId 
                                                ? 'bg-primary text-white dark:bg-primary-dark' 
                                                : 'bg-surface-light dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                                <div className="font-medium truncate" title={session.preview}>{session.preview || `Session ${session.sessionId.substring(0,8)}`}</div>
                                <div className={`text-[0.7rem] ${selectedSessionId === session.sessionId ? 'text-blue-100 dark:text-blue-200' : 'text-text-muted-light dark:text-text-muted-dark'}`}>
                                    {formatDate(session.updatedAt)} - {session.messageCount} msgs
                                </div>
                                {/* Delete button placeholder
                                <button 
                                    className="absolute top-1 right-1 p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => handleDeleteSession(session.sessionId, e)}
                                    title="Delete session"
                                >
                                    <Trash2 size={14} />
                                </button>
                                */}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Session Details */}
                <div className="w-full md:w-2/3 flex flex-col overflow-hidden mt-4 md:mt-0">
                    <h3 className="text-sm font-semibold mb-2 text-text-light dark:text-text-dark">Session Details</h3>
                    <div className="flex-grow bg-gray-50 dark:bg-gray-800 p-3 rounded-md overflow-y-auto custom-scrollbar border border-border-light dark:border-border-dark">
                        {loadingMessages && <div className="flex justify-center p-4"><Loader2 className="animate-spin text-primary" size={24} /></div>}
                        {!selectedSessionId && !loadingMessages && (
                            <div className="flex flex-col items-center justify-center h-full text-text-muted-light dark:text-text-muted-dark text-sm">
                                <MessageSquareText size={40} className="mb-3 opacity-50" />
                                <p>Select a session from the left to view its messages.</p>
                            </div>
                        )}
                        {selectedSessionId && !loadingMessages && sessionMessages.length === 0 && 
                            <p className="text-center text-sm text-text-muted-light dark:text-text-muted-dark p-4">No messages in this session.</p>
                        }
                        <div className="space-y-3">
                            {sessionMessages.map(msg => (
                                <div key={msg.id} 
                                     className={`p-2.5 rounded-lg shadow-sm w-fit max-w-[90%] text-xs
                                                ${msg.sender === 'user' 
                                                    ? 'bg-blue-500 text-white ml-auto' 
                                                    : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100'}`}>
                                    <p className="font-semibold text-[0.7rem] mb-0.5">{msg.sender === 'user' ? 'You' : 'AI Tutor'}</p>
                                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                                    <p className="text-[0.65rem] opacity-70 mt-1 text-right">{formatDate(msg.timestamp)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-6 pt-4 border-t border-border-light dark:border-border-dark flex justify-end gap-3">
                <button 
                    onClick={onClose} 
                    className="px-4 py-2 text-xs font-medium rounded-md bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-text-light dark:text-text-dark transition-colors"
                >
                    Close
                </button>
                <button 
                    onClick={handleLoadSessionAndClose} 
                    className="px-4 py-2 text-xs font-medium rounded-md btn-primary disabled:opacity-50"
                    disabled={!selectedSessionId || loadingMessages || loadingSessions}
                >
                    Load Selected Session
                </button>
            </div>
        </Modal>
    );
}
export default ChatHistoryModal;