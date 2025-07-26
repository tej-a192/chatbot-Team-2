// src/components/chat/MessageBubble.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { marked } from 'marked';
import Prism from 'prismjs';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Link as LinkIcon, Zap, Server, Volume2, StopCircle, ServerCrash, Copy, Check } from 'lucide-react';
import ThinkingDropdown from './ThinkingDropdown.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import { useTextToSpeech } from '../../hooks/useTextToSpeech.js';
import IconButton from '../core/IconButton.jsx';
import { renderMathInHtml } from '../../utils/markdownUtils';
import { getPlainTextFromMarkdown } from '../../utils/helpers.js';
import DOMPurify from 'dompurify';
import { useTypingEffect } from '../../hooks/useTypingEffect.js';

marked.setOptions({ breaks: true, gfm: true });

const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };
    let rawHtml = marked.parse(markdownText);
    rawHtml = renderMathInHtml(rawHtml);
    const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true, mathMl: true, svg: true } });
    return { __html: cleanHtml };
};

const escapeHtml = (unsafe) => {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, `"`).replace(/'/g, "'");
};

const AnimatedThinking = ({ content }) => {
    const [completedTyping, setCompletedTyping] = useState('');
    const [currentTyping, setCurrentTyping] = useState('');
    const [isWaiting, setIsWaiting] = useState(true);
    const lastContentRef = useRef('');

    useEffect(() => {
        if (content && content.length > lastContentRef.current.length) {
            const newChunk = content.substring(lastContentRef.current.length);
            setCurrentTyping(newChunk);
            setIsWaiting(false);
            lastContentRef.current = content;
        }
    }, [content]);

    const onTypingComplete = useCallback(() => {
        setCompletedTyping(prev => prev + currentTyping);
        setCurrentTyping('');
        setIsWaiting(true);
    }, [currentTyping]);

    const animatedChunk = useTypingEffect(currentTyping, 4, onTypingComplete);
    const combinedText = completedTyping + animatedChunk;

    return (
        <div className="prose prose-xs dark:prose-invert max-w-none text-text-muted-light dark:text-text-muted-dark">
            <div dangerouslySetInnerHTML={createMarkup(combinedText)} />
            {isWaiting && <span className="animate-pulse"> Thinking...</span>}
        </div>
    );
};

function MessageBubble({ sender, text, thinking, references, timestamp, sourcePipeline, isStreaming }) {
    const isUser = sender === 'user';
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const contentRef = useRef(null);
    const [isCopied, setIsCopied] = useState(false);
    const { speak, cancel, isSpeaking } = useTextToSpeech();

    const mainContent = text || '';
    const thinkingContent = thinking;
    const showThinkingDropdown = !isUser && thinkingContent !== null;

    useEffect(() => {
        if (!isStreaming && mainContent) {
            const timer = setTimeout(() => {
                if (contentRef.current) Prism.highlightAllUnder(contentRef.current);
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isStreaming, mainContent]);
    
    const handleCopy = () => {
        if (isCopied) return;
        const plainTextToCopy = getPlainTextFromMarkdown(mainContent);
        navigator.clipboard.writeText(plainTextToCopy).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 1000);
        });
    };
    
    const formatTimestamp = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const getPipelineIcon = () => {
        if (!sourcePipeline) return null;
        const lower = sourcePipeline.toLowerCase();
        if (lower.includes('ollama')) return <Zap size={12} className="text-green-400" title="Ollama" />;
        if (lower.includes('gemini')) return <Server size={12} className="text-blue-400" title="Gemini" />;
        if (lower.includes('rag')) return <Zap size={12} className="text-purple-400" title="RAG" />;
        if (lower.includes('error')) return <ServerCrash size={12} className="text-red-400" title="Error" />;
        return null;
    };
    
    return (
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full group`}>
            <div className={`message-bubble-wrapper max-w-[85%] md:max-w-[75%] ${isStreaming ? 'w-full' : ''}`}>
                {showThinkingDropdown && (
                    <div className="mb-1.5">
                        <ThinkingDropdown
                            isOpen={isDropdownOpen}
                            setIsOpen={setIsDropdownOpen}
                            isStreaming={isStreaming}
                        >
                            {isStreaming 
                                ? <AnimatedThinking content={thinkingContent} /> 
                                : <div className="prose prose-xs dark:prose-invert max-w-none text-text-muted-light dark:text-text-muted-dark" dangerouslySetInnerHTML={createMarkup(thinkingContent)} />
                            }
                        </ThinkingDropdown>
                    </div>
                )}

                {isStreaming ? (
                    <TypingIndicator />
                ) : (
                    <div className={`message-bubble relative p-3 rounded-2xl shadow-md break-words ${
                        isUser 
                        ? 'bg-surface-light text-text-light border border-border-light dark:bg-primary-dark dark:text-white dark:border-transparent rounded-br-lg' 
                        : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-bl-lg border border-border-light dark:border-border-dark'
                    }`}>
                        <div ref={contentRef} className="prose prose-sm dark:prose-invert max-w-none message-content leading-relaxed" dangerouslySetInnerHTML={createMarkup(mainContent)} />
                        <div className="flex items-center justify-end mt-1.5 text-xs gap-1">
                            <button onClick={handleCopy} title={isCopied ? 'Copied!' : 'Copy content'} disabled={isCopied} className="p-1 rounded-md text-text-muted-light dark:text-text-muted-dark hover:bg-gray-200 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-all duration-200 focus:outline-none">
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div key={isCopied ? 'check' : 'copy'} initial={{ scale: 0.6, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.6, opacity: 0, rotate: 30 }} transition={{ duration: 0.15 }}>
                                        {isCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                                    </motion.div>
                                </AnimatePresence>
                            </button>
                            <div className="flex items-center gap-2 pl-1 opacity-70">
                                {!isUser && getPipelineIcon() && <span className="mr-1">{getPipelineIcon()}</span>}
                                <span>{formatTimestamp(timestamp)}</span>
                                {!isUser && (
                                    <IconButton icon={isSpeaking ? StopCircle : Volume2} onClick={() => isSpeaking ? cancel() : speak({ text: mainContent })} title={isSpeaking ? "Stop reading" : "Read aloud"} size="sm" variant="ghost" className={`p-0.5 ${isSpeaking ? 'text-red-500' : 'text-text-muted-light dark:text-text-muted-dark hover:text-primary'}`} />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {!isStreaming && !isUser && references && references.length > 0 && (
                <div className="message-metadata-container max-w-[85%] md:max-w-[75%] mt-1.5 pl-2">
                     <details className="group/details text-xs" open>
                        <summary className="flex items-center gap-1 cursor-pointer text-text-muted-light dark:text-text-muted-dark hover:text-primary dark:hover:text-primary-light transition-colors">
                            <LinkIcon size={14} /> References
                        </summary>
                        <ul className="mt-1 pl-1 space-y-0.5 text-[0.7rem]">
                            {references.map((ref, index) => (
                                <li key={index} className="text-text-muted-light dark:text-text-muted-dark hover:text-text-light dark:hover:text-text-dark transition-colors truncate" title={`Preview: ${escapeHtml(ref.content_preview || '')}\nSource: ${escapeHtml(ref.source || '')}`}>
                                    <span className="font-semibold text-accent">[{ref.number}]</span> {escapeHtml(ref.source)}
                                </li>
                            ))}
                        </ul>
                    </details>
                </div>
            )}
        </div>
    );
}

export default MessageBubble;