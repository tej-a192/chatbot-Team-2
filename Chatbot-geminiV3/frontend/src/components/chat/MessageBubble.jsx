// src/components/chat/MessageBubble.jsx
import React from 'react';
import { marked } from 'marked';
import { ChevronDown, Brain, Link as LinkIcon, Zap, Server } from 'lucide-react';

marked.setOptions({
  breaks: true,
  gfm: true,
  // sanitize: false, // Consider DOMPurify for production
});

const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };
    const rawHtml = marked.parse(markdownText);
    return { __html: rawHtml };
};

const escapeHtml = (unsafe) => {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&") // Use & for ampersand
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, `"`)
         .replace(/'/g, "'");
};

function MessageBubble({ sender, text, thinking, references, timestamp, sourcePipeline }) {
    const isUser = sender === 'user';

    const formatTimestamp = (ts) => {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) { return 'Invalid Time'; }
    };

    const getPipelineIcon = () => {
        if (!sourcePipeline) return null;
        // Standardize pipeline names for icons
        const lowerPipeline = sourcePipeline.toLowerCase();
        if (lowerPipeline.includes('ollama')) return <Zap size={12} className="text-green-400" title="Ollama Powered" />;
        if (lowerPipeline.includes('gemini')) return <Server size={12} className="text-blue-400" title="Gemini Powered" />;
        if (lowerPipeline.includes('rag')) return <Zap size={12} className="text-purple-400" title="RAG Enhanced" />; // Example for RAG
        if (lowerPipeline.includes('error')) return <ServerCrash size={12} className="text-red-400" title="Error" />;
        return null;
    };

    return (
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full group`}>
            <div 
                className={`message-bubble max-w-[85%] md:max-w-[75%] p-3 rounded-2xl shadow-md break-words ${
                    isUser 
                    ? 'bg-primary dark:bg-primary-dark text-white rounded-br-lg' 
                    : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-bl-lg border border-border-light dark:border-border-dark'
                }`}
            >
                {/* Main message content */}
                <div 
                    className="prose prose-sm dark:prose-invert max-w-none message-content leading-relaxed" 
                    dangerouslySetInnerHTML={createMarkup(text || '')} 
                />
                
                {/* Timestamp and Pipeline Icon */}
                <div className="flex items-center justify-end mt-1.5 text-xs opacity-70">
                    {!isUser && getPipelineIcon() && <span className="mr-1.5">{getPipelineIcon()}</span>}
                    {formatTimestamp(timestamp)}
                </div>
            </div>

            {/* Metadata: Thinking and References for Bot Messages */}
            {!isUser && (thinking || (references && references.length > 0)) && (
                <div className="message-metadata-container max-w-[85%] md:max-w-[75%] mt-1.5 pl-2 space-y-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    {thinking && thinking.trim() && (
                        <details className="group/details text-xs">
                            <summary className="flex items-center gap-1 cursor-pointer text-text-muted-light dark:text-text-muted-dark hover:text-primary dark:hover:text-primary-light transition-colors">
                                <Brain size={14} /> AI Reasoning
                                <ChevronDown size={14} className="group-open/details:rotate-180 transition-transform" />
                            </summary>
                            <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-text-light dark:text-text-dark whitespace-pre-wrap break-all text-[0.7rem] max-h-32 overflow-y-auto custom-scrollbar">
                                <code>{escapeHtml(thinking)}</code>
                            </pre>
                        </details>
                    )}
                    {references && references.length > 0 && (
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
                    )}
                </div>
            )}
        </div>
    );
}
export default MessageBubble;