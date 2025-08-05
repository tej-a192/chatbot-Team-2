// frontend/src/components/chat/MessageBubble.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { marked } from 'marked';
import Prism from 'prismjs';
import { motion } from 'framer-motion';
import { ChevronDown, Link as LinkIcon, Zap, Server, Volume2, StopCircle, ServerCrash, Copy, Check, Lightbulb } from 'lucide-react';
import ThinkingDropdown from './ThinkingDropdown.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import { useTextToSpeech } from '../../hooks/useTextToSpeech.js';
import IconButton from '../core/IconButton.jsx';
import { renderMathInHtml } from '../../utils/markdownUtils';
import { getPlainTextFromMarkdown } from '../../utils/helpers.js';
import DOMPurify from 'dompurify';
// DocumentDownloadBubble is no longer needed here as it's rendered by the parent
// import DocumentDownloadBubble from './DocumentDownloadBubble.jsx';

marked.setOptions({ breaks: true, gfm: true });

const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };
    let rawHtml = marked.parse(markdownText);
    rawHtml = renderMathInHtml(rawHtml);
    const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true, mathMl: true, svg: true } });
    return { __html: cleanHtml };
};

function MessageBubble({ msg, onCueClick }) {
    // Hooks are now safe because this component is ONLY ever rendered for text-based messages.
    const [isCopied, setIsCopied] = useState(false);
    const { speak, cancel, isSpeaking } = useTextToSpeech();
    const contentRef = useRef(null);

    const { 
        sender, text, thinking, references, timestamp, 
        sourcePipeline, isStreaming, criticalThinkingCues, 
    } = msg;

    const mainContent = text || '';
    const isUser = sender === 'user';
    const showThinkingDropdown = !isUser && thinking && !isStreaming;

    useEffect(() => {
        if (!isStreaming && mainContent && contentRef.current) {
            const timer = setTimeout(() => Prism.highlightAllUnder(contentRef.current), 50);
            return () => clearTimeout(timer);
        }
    }, [isStreaming, mainContent]);
    
    const handleCopy = useCallback(() => {
        const plainText = getPlainTextFromMarkdown(text);
        navigator.clipboard.writeText(plainText).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    }, [text]);

    const formatTimestamp = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getPipelineIcon = () => {
        if (!sourcePipeline) return null;
        const IconMap = { 'agent': Zap, 'rag': Server, 'kg': Server, 'error': ServerCrash, 'generate_document': Server };
        const baseTool = sourcePipeline.split('-')[1] || sourcePipeline;
        const Icon = IconMap[baseTool] || Zap;
        return <Icon size={12} className="text-text-muted-light dark:text-text-muted-dark" />;
    };
    
    return (
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full group`}>
            <div className={`message-bubble-wrapper max-w-[85%] md:max-w-[75%]`}>
                {showThinkingDropdown && (
                    <div className="mb-1.5 ml-2">
                         <ThinkingDropdown isOpen={false} setIsOpen={()=>{}} isStreaming={isStreaming}>
                            <pre className="text-xs text-text-muted-light dark:text-text-muted-dark whitespace-pre-wrap font-sans leading-relaxed">
                                {thinking}
                            </pre>
                        </ThinkingDropdown>
                    </div>
                )}

                {isStreaming ? (
                    <TypingIndicator />
                ) : (
                    <div className={`message-bubble relative p-4 rounded-2xl shadow-md break-words ${
                        isUser 
                        ? 'bg-surface-light text-text-light border border-border-light dark:bg-primary-dark dark:text-white dark:border-transparent rounded-br-lg' 
                        : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-bl-lg border border-border-light dark:border-border-dark'
                    }`}>
                        <div ref={contentRef} className="prose prose-sm dark:prose-invert max-w-none message-content leading-relaxed" dangerouslySetInnerHTML={createMarkup(mainContent)} />
                        <div className="flex items-center justify-end mt-2 text-xs gap-2 text-text-muted-light dark:text-text-muted-dark">
                            {getPipelineIcon()}
                            <span>{formatTimestamp(timestamp)}</span>
                            {!isUser && !isStreaming && (
                                <>
                                    <IconButton onClick={isSpeaking ? cancel : () => speak({ text })} title={isSpeaking ? "Stop Speaking" : "Read Aloud"}>
                                        {isSpeaking ? <StopCircle size={16} /> : <Volume2 size={16} />}
                                    </IconButton>
                                    <IconButton onClick={handleCopy} title="Copy Text">
                                        {isCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                                    </IconButton>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {!isUser && references && references.length > 0 && !isStreaming && (
                <div className="flex flex-col items-start w-full max-w-[85%] md:max-w-[75%] mt-2 pl-3">
                    <h4 className="text-xs font-semibold text-text-muted-light dark:text-text-muted-dark mb-1">References</h4>
                    <ul className="space-y-1">
                        {references.map((ref, index) => (
                            <li key={index} className="flex items-center gap-2 text-xs text-text-light dark:text-text-dark">
                                <LinkIcon size={12} className="text-primary flex-shrink-0" />
                                <a href={ref.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" title={ref.source}>
                                    {`[${ref.number}] ${ref.source}`}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {!isUser && criticalThinkingCues && criticalThinkingCues.length > 0 && !isStreaming && (
                <div className="flex flex-col items-start w-full max-w-[85%] md:max-w-[75%] mt-3 pl-3">
                    <h4 className="text-xs font-semibold text-text-muted-light dark:text-text-muted-dark mb-1 flex items-center gap-1.5">
                        <Lightbulb size={14} className="text-secondary"/>
                        Consider These Next...
                    </h4>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {criticalThinkingCues.map((cue, index) => (
                             <button key={index} onClick={() => onCueClick(cue)}
                                className="text-xs bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-full px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200">
                                {cue}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MessageBubble;