import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import { motion, AnimatePresence } from 'framer-motion';

function ChatHistory({ messages, isLoading }) {
    const chatHistoryRef = useRef(null);

    useEffect(() => {
        if (chatHistoryRef.current) {
            chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div ref={chatHistoryRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            <AnimatePresence initial={false}>
                {messages.map((msg, index) => (
                    <motion.div
                        key={msg.id || index} // Critical for AnimatePresence
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                        <MessageBubble
                            sender={msg.sender}
                            text={msg.text}
                            thinking={msg.thinking}
                            references={msg.references}
                            timestamp={msg.timestamp}
                            sourcePipeline={msg.source_pipeline}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
            {isLoading && messages.length > 0 && ( // Show typing indicator only if there are prior messages
                 <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start pl-2 mt-2"
                 >
                    <div className="message-bubble bot-message bg-surface-light dark:bg-surface-dark p-2 inline-flex items-center gap-1">
                        <span className="animate-pulse text-text-muted-light dark:text-text-muted-dark text-xs">●</span>
                        <span className="animate-pulse delay-100 text-text-muted-light dark:text-text-muted-dark text-xs">●</span>
                        <span className="animate-pulse delay-200 text-text-muted-light dark:text-text-muted-dark text-xs">●</span>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
export default ChatHistory;
