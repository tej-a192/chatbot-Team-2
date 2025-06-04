// src/components/chat/MessageBubble.jsx
import React, { useEffect, useRef } from 'react'; // useEffect and useRef are already here
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Prism from 'prismjs'; 
import { renderMathInHtml } from '../../utils/markdownUtils';
import { ChevronDown, Brain, Link as LinkIcon, Zap, Server, ServerCrash } from 'lucide-react'; // Added ServerCrash just in case

marked.setOptions({
  breaks: true,
  gfm: true,
});

const createMarkup = (markdownText) => {
  if (!markdownText) return { __html: '' };
  console.log("[Math Test] createMarkup: Original Markdown:", markdownText);

  let html = marked.parse(markdownText);
  console.log("[Math Test] createMarkup: HTML after marked.parse():", html);

  html = renderMathInHtml(html); // <<<< RE-ENABLE THIS
  console.log("[Math Test] createMarkup: HTML after renderMathInHtml():", html);

  // Use a VERY PERMISSIVE DOMPurify config for this test, or even bypass temporarily
  // This is to see if KaTeX output itself is okay before complex sanitization.
  const cleanHtml = DOMPurify.sanitize(html, {
      // Option A: Try with USE_PROFILES first if your DOMPurify supports it
      USE_PROFILES: { html: true, mathMl: true, svg: true },
      // Option B: If USE_PROFILES is not enough or not available,
      // start with a broader allowance for tags and attributes known to be used by KaTeX.
      // This is less secure for general HTML but helps debug KaTeX rendering.
      // ADD_TAGS: ['math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 'msqrt', 'mtable', 'mtr', 'mtd', 'mstyle', 'semantics', 'annotation', 'span'],
      // ADD_ATTR: ['class', 'style', 'xmlns', 'display', 'mathvariant', 'mathsize', 'fontstyle', 'fontweight', 'color', 'background', 'href', 'encoding', 'role', 'aria-hidden', /* add more as needed from KaTeX output */],
      // FOR_THIS_TEST_ONLY_IF_STILL_ISSUES (VERY INSECURE - REMOVE FOR PRODUCTION):
      // RETURN_TRUSTED_TYPE: true, // Might be needed for some modern browser contexts if issues persist with types
      // ALLOW_UNKNOWN_PROTOCOLS: true, // If KaTeX uses any odd hrefs (unlikely)
      // ALLOW_DATA_ATTR: true, // KaTeX might use data-* attributes
  });
  console.log("[Math Test] createMarkup: HTML after DOMPurify.sanitize():", cleanHtml);

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

function MessageBubble({ sender, text, thinking, references, timestamp, sourcePipeline }) {
    const isUser = sender === 'user';
    const messageContentRef = useRef(null); // Ref for the main message content div
    const thinkingContentRef = useRef(null); // Ref for the thinking content pre/code block if it contains Markdown

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

    useEffect(() => {
        if (messageContentRef.current) {
            Prism.highlightAllUnder(messageContentRef.current);
        }
    }, [text]);

    useEffect(() => {
        if (thinkingContentRef.current && thinking && typeof thinking === 'string') {
            const isThinkingMarkdown = thinkingContentRef.current.querySelector('.prose'); // A simple check
            if (isThinkingMarkdown) {
                Prism.highlightAllUnder(thinkingContentRef.current);
            }
        }
    }, [thinking]); // Re-run when the 'thinking' prop changes

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
                    ref={messageContentRef} // Assign ref to the div that will contain the HTML from Markdown
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
                            {/*
                                If 'thinking' is just plain text to be displayed in a <pre><code> block,
                                then Prism.highlightAllUnder won't naturally pick it up unless you
                                manually add a language class to the <code> tag AND 'thinking' contains
                                code in that language.

                                If 'thinking' can itself be Markdown (and thus contain fenced code blocks),
                                you would use dangerouslySetInnerHTML here as well and apply Prism to it.
                                For now, assuming 'thinking' is primarily plain text.
                            */}
                            <pre
                                ref={thinkingContentRef} // Add ref here if 'thinking' can be Markdown with code blocks
                                className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-text-light dark:text-text-dark whitespace-pre-wrap break-all text-[0.7rem] max-h-32 overflow-y-auto custom-scrollbar"
                                // If 'thinking' is Markdown:
                                // dangerouslySetInnerHTML={createMarkup(thinking)}
                            >
                                {/* If 'thinking' is plain text: */}
                                <code className="language-text">{escapeHtml(thinking)}</code>
                                {/* Added language-text to allow Prism to at least touch it, though it won't do much for plain text.
                                    If 'thinking' was Python code for example, you'd use 'language-python'.
                                    This part is tricky if 'thinking' isn't structured Markdown itself.
                                */}
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