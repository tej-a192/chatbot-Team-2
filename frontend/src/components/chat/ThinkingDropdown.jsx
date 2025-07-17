// frontend/src/components/chat/ThinkingDropdown.jsx
import React, { useState } from 'react';
import { ChevronDown, BrainCircuit } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function ThinkingDropdown({ children }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="w-full">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted-light dark:text-text-muted-dark hover:text-primary dark:hover:text-primary-light transition-colors py-1"
                aria-expanded={isOpen}
            >
                <BrainCircuit size={14} />
                <span>Thinking Process</span>
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
                            open: { opacity: 1, height: 'auto', marginTop: '0.25rem' },
                            collapsed: { opacity: 0, height: 0, marginTop: '0' }
                        }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        {/* The vertical line and padding for the content */}
                        <div className="pl-4 border-l-2 border-gray-300 dark:border-gray-600">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default ThinkingDropdown;