import React from 'react';
import { marked } from 'marked'; // Ensure marked is installed
import { ChevronDown, Brain, Link as LinkIcon, Zap, Server } from 'lucide-react'; // Zap for Ollama, Server for Gemini (example)

// Configure marked for consistent rendering
// WARNING: sanitize: false can be a security risk if LLM output is not trusted.
// For production, use DOMPurify:
// import DOMPurify from 'dompurify';
// const cleanHtml = DOMPurify.sanitize(rawHtml);
marked.setOptions({
  breaks: true,
  gfm: true,
  // sanitize: false, // Set to true or use DOMPurify for production if LLM output is untrusted
});

const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };
    const rawHtml = marked.parse(markdownText);
    // const cleanHtml = DOMPurify.sanitize(rawHtml); // For production
    return { __html: rawHtml }; // For dev, or if LLM output is trusted
};

const escapeHtml = (unsafe) => {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, '"')
         .replace(/'/g, "'");
};


function MessageBubble({ sender, text, thinking, references, timestamp, sourcePipeline }) {
    const isUser = sender === 'user';

    const formatTimestamp = (ts) => {
        if (!ts) return '';
        try {
            return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) { return ''; }
    };

    const getPipelineIcon = () => {
        if (!sourcePipeline) return null;
        if (sourcePipeline.includes('ollama')) return <Zap size={12} className="text-green-400" title="Ollama" />;
        if (sourcePipeline.includes('gemini')) return <Server size={12} className="text-blue-400" title="Gemini" />;
        return null;
    };

    return (
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} w-full`}>
            <div 
                className={`message-bubble max-w-[85%] md:max-w-[75%] p-3 rounded-2xl shadow-md ${
                    isUser 
                    ? 'bg-primary dark:bg-primary-dark text-white rounded-br-lg' 
                    : 'bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark rounded-bl-lg border border-gray-200 dark:border-gray-700'
                }`}
            >
                <div className="prose prose-sm dark:prose-invert max-w-none message-content" dangerouslySetInnerHTML={createMarkup(text || '')} />
                
                <div className="flex items-center justify-end mt-1.5 text-xs opacity-70">
                    {!isUser && getPipelineIcon() && <span className="mr-1.5">{getPipelineIcon()}</span>}
                    {formatTimestamp(timestamp)}
                </div>
            </div>

            {!isUser && (thinking || (references && references.length > 0)) && (
                <div className="message-metadata-container max-w-[85%] md:max-w-[75%] mt-1.5 pl-2">
                    {thinking && (
                        <details className="group text-xs mb-1">
                            <summary className="flex items-center gap-1 cursor-pointer text-text-muted-light dark:text-text-muted-dark hover:text-primary dark:hover:text-primary-light transition-colors">
                                <Brain size={14} /> Reasoning
                                <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
                            </summary>
                            <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-text-light dark:text-text-dark whitespace-pre-wrap break-all text-[0.7rem] max-h-32 overflow-y-auto custom-scrollbar">
                                <code>{escapeHtml(thinking)}</code>
                            </pre>
                        </details>
                    )}
                    {references && references.length > 0 && (
                        <details className="group text-xs" open>
                            <summary className="flex items-center gap-1 cursor-pointer text-text-muted-light dark:text-text-muted-dark hover:text-primary dark:hover:text-primary-light transition-colors">
                                <LinkIcon size={14} /> References
                                <ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
                            </summary>
                            <ul className="mt-1 pl-1 space-y-0.5 text-[0.7rem]">
                                {references.map((ref, index) => (
                                    <li 
                                        key={index} 
                                        className="text-text-muted-light dark:text-text-muted-dark hover:text-text-light dark:hover:text-text-dark transition-colors"
                                        title={`Preview: ${escapeHtml(ref.content_preview || '')}`}
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