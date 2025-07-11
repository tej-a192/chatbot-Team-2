// frontend/src/components/chat/ThinkingDropdown.jsx
import React, { useState } from 'react';
import { ChevronDown, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function ThinkingDropdown({ children, isStreaming }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="text-xs border border-border-light dark:border-border-dark rounded-md bg-surface-light/50 dark:bg-surface-dark/50 shadow-sm mt-1.5 w-full">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-2 text-left text-text-muted-light dark:text-text-muted-dark hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors rounded-t-md"
                aria-expanded={isOpen}
            >
                <div className="flex items-center gap-2 font-medium">
                    <BrainCircuit size={14} />
                    <span className="flex-grow">Thinking Process</span>
                </div>
                {/* Shimmer effect for when streaming is active */}
                {isStreaming && (
                    <div className="relative w-20 h-4 ml-auto mr-2 overflow-hidden rounded bg-gray-200 dark:bg-gray-600">
                        <div className="shimmer-animation"></div>
                    </div>
                )}
                <ChevronDown size={16} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        key="content"
                        initial="collapsed"
                        animate="open"
                        exit="collapsed"
                        variants={{
                            open: { opacity: 1, height: 'auto' },
                            collapsed: { opacity: 0, height: 0 }
                        }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="p-2.5 border-t border-border-light dark:border-border-dark bg-white dark:bg-gray-800 rounded-b-md">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default ThinkingDropdown;