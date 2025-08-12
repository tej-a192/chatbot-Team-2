import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import { marked } from 'marked';
import Prism from 'prismjs';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Link as LinkIcon, Zap, Server, Volume2, StopCircle, ServerCrash, Copy, Check, Lightbulb } from 'lucide-react';
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

const CodeBlockWithCopyButton = ({ children, codeText, key }) => {
    const [copied, setCopied] = useState(false);
    const codeRef = useRef(null);

    useEffect(() => {
        if (codeRef.current) {
            Prism.highlightAllUnder(codeRef.current);
        }
    }, [children]);

    const handleCopyCode = () => {
        navigator.clipboard.writeText(codeText).then(() => {
            setCopied(true);
            toast.success('Code copied!');
            setTimeout(() => setCopied(false), 1500);
        }).catch(err => {
            toast.error('Failed to copy code.');
            console.error('Failed to copy code:', err);
        });
    };

    return (
        <div className="relative group/code" ref={codeRef} key={key}>
            <div dangerouslySetInnerHTML={{ __html: children }} /> 
            <button
                onClick={handleCopyCode}
                title={copied ? 'Copied!' : 'Copy code'}
                disabled={copied}
                className="absolute top-1 right-1 p-1.5 rounded-md cursor-pointer text-text-muted-dark bg-gray-700/80 backdrop-blur-sm transition-opacity duration-200 opacity-0 group-hover/code:opacity-100"
            >
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                        key={copied ? 'check' : 'copy'}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                    >
                        {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                    </motion.span>
                </AnimatePresence>
            </button>
        </div>
    );
};

const parseAndRenderMarkdown = (markdownText, messageId) => {
    if (!markdownText) return [];

    let htmlString = createMarkup(markdownText).__html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    const resultNodes = [];
    let currentHtmlBuffer = '';

    const flushHtmlBuffer = () => {
        if (currentHtmlBuffer) {
            resultNodes.push(
                <div key={`html-${messageId}-${resultNodes.length}-${Math.random().toString(36).substring(2,9)}`} 
                     dangerouslySetInnerHTML={{ __html: currentHtmlBuffer }} />
            );
            currentHtmlBuffer = '';
        }
    };

    const traverse = (node) => {
        if (!node) return;

        if (node.nodeName === 'PRE') {
            flushHtmlBuffer();

            const codeElement = node.querySelector('code');
            const codeText = codeElement ? codeElement.textContent : '';
            const preOuterHtml = node.outerHTML;

            resultNodes.push(
                <CodeBlockWithCopyButton 
                    key={`code-${messageId}-${resultNodes.length}-${Math.random().toString(36).substring(2,9)}`}
                    codeText={codeText}
                >
                    {preOuterHtml}
                </CodeBlockWithCopyButton>
            );
            return; 
        } 
        
        if (node.nodeType === Node.TEXT_NODE) {
            currentHtmlBuffer += node.nodeValue;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            currentHtmlBuffer += node.outerHTML; 
            return; 
        }

        Array.from(node.childNodes).forEach(traverse);
    };

    Array.from(doc.body.children).forEach(traverse);
    
    flushHtmlBuffer();

    return resultNodes;
};


function MessageBubble({ sender, text, thinking, references, timestamp, sourcePipeline, isStreaming, criticalThinkingCues, onCueClick, messageId }) {
    const isUser = sender === 'user';
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const contentRef = useRef(null);
    const { speak, cancel, isSpeaking } = useTextToSpeech();
    
    const [isCopied, setIsCopied] = useState(false);
    const mainContent = text || '';
    const thinkingContent = thinking;
    const showThinkingDropdown = !isUser && thinkingContent !== null;

    useEffect(() => {
        if (contentRef.current && !isStreaming) {
            const timer = setTimeout(() => {
                Prism.highlightAllUnder(contentRef.current);
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
            toast.success('Message copied!');
        }).catch(err => {
            toast.error('Failed to copy message.');
            console.error('Failed to copy message:', err);
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
                        <div ref={contentRef} className="prose prose-sm dark:prose-invert max-w-none message-content leading-relaxed">
                            {parseAndRenderMarkdown(mainContent, messageId)}
                        </div>

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
                    <details className="group/details text-xs">
                        <summary className="flex items-center justify-between gap-1 cursor-pointer text-text-muted-light dark:text-text-muted-dark hover:text-primary dark:hover:text-primary-light transition-colors">
                            <span className="flex items-center gap-1">
                                <LinkIcon size={14} /> References
                            </span>
                            <ChevronDown size={14} className="transition-transform group-open/details:rotate-180" />
                        </summary>
                        <ul className="mt-1 pl-1 space-y-0.5 text-[0.7rem]">
                            {references.map((ref, index) => (
                                <li 
                                    key={index} 
                                    className="text-text-muted-light dark:text-text-muted-dark hover:text-text-light dark:hover:text-text-dark transition-colors truncate"
                                    title={`Preview: ${escapeHtml(ref.content_preview || '')}\nSource: ${escapeHtml(ref.source || '')}`}
                                >
                                    <span className="font-semibold text-accent">[{ref.number}]</span> {escapeHtml(ref.source)}
                                </li>
                            ))}
                        </ul>
                    </details>
                </div>
            )}
            
            {!isStreaming && !isUser && criticalThinkingCues && (
                <div className="max-w-[85%] md:max-w-[75%] w-full mt-2 pl-2 animate-fadeIn">
                    <div className="border-t border-dashed border-border-light dark:border-border-dark pt-2">
                        <h4 className="text-xs font-semibold text-text-muted-light dark:text-text-muted-dark flex items-center gap-1.5 mb-2">
                            <Lightbulb size={14} />
                            Critical Thinking Prompts
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {criticalThinkingCues.verificationPrompt && (
                                <button
                                    onClick={() => onCueClick(criticalThinkingCues.verificationPrompt)}
                                    className="text-xs bg-sky-500/10 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 px-2.5 py-1 rounded-full hover:bg-sky-500/20 dark:hover:bg-sky-500/30 transition-colors"
                                >
                                    {criticalThinkingCues.verificationPrompt}
                                </button>
                            )}
                            {criticalThinkingCues.alternativePrompt && (
                                <button
                                    onClick={() => onCueClick(criticalThinkingCues.alternativePrompt)}
                                    className="text-xs bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 px-2.5 py-1 rounded-full hover:bg-amber-500/20 dark:hover:bg-amber-500/30 transition-colors"
                                >
                                    {criticalThinkingCues.alternativePrompt}
                                    </button>
                                )}
                                {criticalThinkingCues.applicationPrompt && (
                                    <button
                                        onClick={() => onCueClick(criticalThinkingCues.applicationPrompt)}
                                        className="text-xs bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 px-2.5 py-1 rounded-full hover:bg-emerald-500/20 dark:hover:bg-emerald-500/30 transition-colors"
                                    >
                                        {criticalThinkingCues.applicationPrompt}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

export default memo(MessageBubble);