// src/components/chat/ChatHistory.jsx
import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import { motion, AnimatePresence } from 'framer-motion';

function ChatHistory({ messages, isLoading }) {
    const chatHistoryRef = useRef(null);

    useEffect(() => {
        if (chatHistoryRef.current) {
            // Smart scroll: only scroll if user is already near the bottom
            const { scrollHeight, clientHeight, scrollTop } = chatHistoryRef.current;
            const isScrolledToBottom = scrollHeight - clientHeight <= scrollTop + 100; // 100px tolerance
            if (isScrolledToBottom) {
                chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
            }
        }
    }, [messages]);

    return (
        <div ref={chatHistoryRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            <AnimatePresence initial={false}>
                {messages.map((msg, index) => ( // Ensure msg.id is unique and stable
                    <motion.div
                        key={msg.id || `msg-${index}-${msg.timestamp}`} // Fallback key if id is missing
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                        <MessageBubble
                            id={msg.id || `msg-${index}-${msg.timestamp}`} // Pass the ID
                            sender={msg.sender} // 'user' or 'bot'
                            text={msg.text}
                            thinking={msg.thinking}
                            references={msg.references}
                            timestamp={msg.timestamp}
                            sourcePipeline={msg.source_pipeline}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
            {isLoading && ( // Show typing indicator, even if no prior messages for immediate feedback
                 <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start pl-2 mt-2"
                 >
                    <div className="message-bubble bot-message bg-surface-light dark:bg-surface-dark p-2 inline-flex items-center gap-1 rounded-lg shadow">
                        <span className="animate-pulseDot1 text-text-muted-light dark:text-text-muted-dark text-xs">●</span>
                        <span className="animate-pulseDot2 text-text-muted-light dark:text-text-muted-dark text-xs">●</span>
                        <span className="animate-pulseDot3 text-text-muted-light dark:text-text-muted-dark text-xs">●</span>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
export default ChatHistory;