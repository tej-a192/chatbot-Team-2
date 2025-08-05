// frontend/src/components/chat/ChatHistory.jsx
import React, { useRef, useEffect } from 'react';
import MessageBubble from './MessageBubble';
import { motion, AnimatePresence } from 'framer-motion';

function ChatHistory({ messages, onCueClick }) {
    const chatHistoryRef = useRef(null);
    useEffect(() => {
        if (chatHistoryRef.current) {
            chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div ref={chatHistoryRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            <AnimatePresence initial={false}>
                {messages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                        {/* --- THIS IS THE FIX --- */}
                        {/* We now pass the entire `msg` object down to MessageBubble */}
                        <MessageBubble
                            msg={msg}
                            onCueClick={onCueClick}
                        />
                        {/* --- END OF FIX --- */}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

export default ChatHistory;