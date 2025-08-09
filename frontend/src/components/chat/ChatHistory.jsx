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
                        transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                        <MessageBubble
                        id={msg.id}
                        sender={msg.sender}
                        text={msg.text}
                        thinking={msg.thinking}
                        references={msg.references}
                        timestamp={msg.timestamp}
                        sourcePipeline={msg.source_pipeline}
                        isStreaming={msg.isStreaming}
                        criticalThinkingCues={msg.criticalThinkingCues}
                        onCueClick={onCueClick}
                        messageId={msg.id}
                        logId={msg.logId} 
                    />

                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

export default ChatHistory;