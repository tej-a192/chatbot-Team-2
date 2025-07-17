// src/components/chat/MessageBubble.jsx
import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import Prism from 'prismjs';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Link as LinkIcon, Zap, Server, Volume2, StopCircle, ServerCrash, Copy, Check } from 'lucide-react';
import ThinkingDropdown from './ThinkingDropdown.jsx';
import { useTextToSpeech } from '../../hooks/useTextToSpeech.js';
import IconButton from '../core/IconButton.jsx';
import { renderMathInHtml } from '../../utils/markdownUtils';
import { getPlainTextFromMarkdown } from '../../utils/helpers.js'; // <-- IMPORT THE NEW HELPER
import DOMPurify from 'dompurify';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };
    let rawHtml = marked.parse(markdownText);
    rawHtml = renderMathInHtml(rawHtml);
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
        USE_PROFILES: { html: true, mathMl: true, svg: true },
        ADD_TAGS: ['iframe'],
        ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'],
    });
    return { __html: cleanHtml };
};

const escapeHtml = (unsafe) => {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, `"`)
         .replace(/'/g, "'");
};

const parseMessageWithThinking = (rawText) => {
    if (!rawText || typeof rawText !== 'string') {
        return { thinking: null, mainContent: rawText || '' };
    }
    const thinkingMatch = rawText.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    let thinking = null;
    let mainContent = rawText;

    if (thinkingMatch && thinkingMatch[1]) {
        thinking = thinkingMatch[1].trim();
        mainContent = rawText.replace(/<thinking>[\s\S]*?<\/thinking>\s*/i, '').trim();
    }

    return { thinking, mainContent };
};

function MessageBubble({ sender, text, references, timestamp, sourcePipeline }) {
    const isUser = sender === 'user';
    const { speak, cancel, isSpeaking: isCurrentlySpeakingThisBubble, isSupported: ttsIsSupported } = useTextToSpeech();
    const contentRef = useRef(null);
    const [isCopied, setIsCopied] = useState(false);
    
    const { thinking: thinkingContent, mainContent } = parseMessageWithThinking(text);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (contentRef.current) {
                Prism.highlightAllUnder(contentRef.current);
            }
        }, 50);
        return () => clearTimeout(timer);
    }, [mainContent]);

    const handleCopy = () => {
        if (isCopied) return;
        // --- THIS IS THE FIX ---
        // Convert the raw markdown content to plain text before copying.
        const plainTextToCopy = getPlainTextFromMarkdown(mainContent);
        navigator.clipboard.writeText(plainTextToCopy).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 1000); // Revert icon after 1 second
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
        // --- END OF FIX ---
    };

    const formatTimestamp = (ts) => {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) { return 'Invalid Time'; }
    };

    const getPipelineIcon = () => {
        if (!sourcePipeline) return null;
        const lowerPipeline = sourcePipeline.toLowerCase();
        if (lowerPipeline.includes('ollama')) return <Zap size={12} className="text-green-400" title="Ollama Powered" />;
        if (lowerPipeline.includes('gemini')) return <Server size={12} className="text-blue-400" title="Gemini Powered" />;
        if (lowerPipeline.includes('rag')) return <Zap size={12} className="text-purple-400" title="RAG Enhanced" />;
        if (lowerPipeline.includes('error')) return <ServerCrash size={12} className="text-red-400" title="Error" />;
        return null;
    };

    const handleToggleSpeech = () => {
        if (!ttsIsSupported || !mainContent) return;
        if (isCurrentlySpeakingThisBubble) {
            cancel();
        } else {
            speak({ text: mainContent });
        }
    };
    
    return (
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full group`}>
            
            {!isUser && thinkingContent && (
                <div className="max-w-[85%] md:max-w-[75%] w-full mb-1">
                    <ThinkingDropdown>
                        <pre className="text-xs text-text-muted-light dark:text-text-muted-dark whitespace-pre-wrap font-sans leading-relaxed">
                           {thinkingContent}
                        </pre>
                    </ThinkingDropdown>
                </div>
            )}
            
            <div 
                className={`message-bubble relative max-w-[85%] md:max-w-[75%] p-3 rounded-2xl shadow-md break-words ${
                    isUser 
                    ? 'bg-surface-light text-text-light border border-border-light dark:bg-primary-dark dark:text-white dark:border-transparent rounded-br-lg' 
                    : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-bl-lg border border-border-light dark:border-border-dark'
                }`}
            >
                <div 
                    ref={contentRef}
                    className="prose prose-sm dark:prose-invert max-w-none message-content leading-relaxed" 
                    dangerouslySetInnerHTML={createMarkup(mainContent || '')} 
                />
                
                <div className="flex items-center justify-end mt-1.5 text-xs gap-1">
                     <button
                        onClick={handleCopy}
                        title={isCopied ? 'Copied!' : 'Copy content'}
                        disabled={isCopied}
                        className="p-1 rounded-md text-text-muted-light dark:text-text-muted-dark hover:bg-gray-200 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 transition-all duration-200 focus:outline-none"
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={isCopied ? 'check' : 'copy'}
                                initial={{ scale: 0.6, opacity: 0, rotate: -30 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                exit={{ scale: 0.6, opacity: 0, rotate: 30 }}
                                transition={{ duration: 0.15 }}
                            >
                                {isCopied ? (
                                    <Check size={16} className="text-green-500" />
                                ) : (
                                    <Copy size={16} />
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </button>
                    <div className="flex items-center gap-2 pl-1 opacity-70">
                        {!isUser && getPipelineIcon() && <span className="mr-1">{getPipelineIcon()}</span>}
                        <span>{formatTimestamp(timestamp)}</span>
                        {!isUser && ttsIsSupported && mainContent && (
                            <IconButton
                                icon={isCurrentlySpeakingThisBubble ? StopCircle : Volume2}
                                onClick={handleToggleSpeech}
                                title={isCurrentlySpeakingThisBubble ? "Stop reading" : "Read aloud"}
                                size="sm"
                                variant="ghost"
                                className={`p-0.5 ${isCurrentlySpeakingThisBubble ? 'text-red-500' : 'text-text-muted-light dark:text-text-muted-dark hover:text-primary'}`}
                            />
                        )}
                    </div>
                </div>
            </div>

            {!isUser && references && references.length > 0 && (
                <div className="message-metadata-container max-w-[85%] md:max-w-[75%] mt-1.5 pl-2 space-y-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <details className="group/details text-xs" open>
                        <summary className="flex items-center gap-1 cursor-pointer text-text-muted-light dark:text-text-muted-dark hover:text-primary dark:hover:text-primary-light transition-colors">
                            <LinkIcon size={14} /> References
                            <ChevronDown size={14} className="group-open/details:rotate-180 transition-transform" />
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
        </div>
    );
}
export default MessageBubble;