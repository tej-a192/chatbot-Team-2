// src/components/chat/MessageBubble.jsx

import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Prism from 'prismjs';
import { renderMathInHtml } from '../../utils/markdownUtils';
import {
  ChevronDown,
  Brain,
  Link as LinkIcon,
  Zap,
  Server,
  ServerCrash,
  Volume2,
  StopCircle,
} from 'lucide-react';
import { useTextToSpeech } from '../../hooks/useTextToSpeech.js';
import IconButton from '../core/IconButton.jsx';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const createMarkup = (markdownText) => {
  if (!markdownText) return { __html: '' };

  let html = marked.parse(markdownText);
  html = renderMathInHtml(html);

  const cleanHtml = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
  });

  return { __html: cleanHtml };
};

const escapeHtml = (unsafe) => {
  if (typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

function MessageBubble({ sender, text, thinking, references, timestamp, sourcePipeline, id: messageId }) {
  const isUser = sender === 'user';
  const messageContentRef = useRef(null);
  const thinkingContentRef = useRef(null);
  const {
    speak,
    cancel,
    isSpeaking: isCurrentlySpeakingThisBubble,
    isSupported: ttsIsSupported,
  } = useTextToSpeech();

  useEffect(() => {
    if (messageContentRef.current) {
      Prism.highlightAllUnder(messageContentRef.current);
    }
  }, [text]);

  useEffect(() => {
    if (thinkingContentRef.current && thinking) {
      Prism.highlightAllUnder(thinkingContentRef.current);
    }
  }, [thinking]);

  const handleToggleSpeech = () => {
    if (!ttsIsSupported || !text) return;
    if (isCurrentlySpeakingThisBubble) {
      cancel();
    } else {
      speak({ text });
    }
  };

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getPipelineIcon = () => {
    switch (sourcePipeline) {
      case 'web-search': return <LinkIcon size={14} />;
      case 'ai-search': return <Zap size={14} />;
      case 'local-rag': return <Server size={14} />;
      case 'pipeline-error': return <ServerCrash size={14} />;
      default: return null;
    }
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
        <div
          ref={messageContentRef}
          className="prose prose-sm dark:prose-invert max-w-none message-content leading-relaxed"
          dangerouslySetInnerHTML={createMarkup(text || '')}
        />

        <div className="flex items-center justify-end mt-1.5 text-xs opacity-70 gap-2">
          {!isUser && getPipelineIcon() && <span>{getPipelineIcon()}</span>}
          <span>{formatTimestamp(timestamp)}</span>
          {!isUser && ttsIsSupported && text && (
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

      {/* Thinking block (AI reasoning) */}
      {thinking && (
        <div className="w-full max-w-[85%] md:max-w-[75%]">
          <details className="mt-1 text-[0.75rem] group open:bg-surface-light dark:open:bg-surface-dark open:rounded-lg open:shadow-sm open:p-2 open:border open:border-border-light dark:open:border-border-dark">
            <summary className="flex items-center gap-1.5 cursor-pointer select-none text-muted">
              <Brain size={14} /> AI Reasoning
              <ChevronDown size={14} className="group-open/details:rotate-180 transition-transform" />
            </summary>
            <pre
              ref={thinkingContentRef}
              className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-text-light dark:text-text-dark whitespace-pre-wrap break-all text-[0.7rem] max-h-32 overflow-y-auto custom-scrollbar"
            >
              <code className="language-text">{escapeHtml(thinking)}</code>
            </pre>
          </details>
        </div>
      )}

      {/* References */}
      {references?.length > 0 && (
        <div className="w-full max-w-[85%] md:max-w-[75%] mt-1">
          <details className="text-[0.75rem] group open:bg-surface-light dark:open:bg-surface-dark open:rounded-lg open:shadow-sm open:p-2 open:border open:border-border-light dark:open:border-border-dark">
            <summary className="flex items-center gap-1.5 cursor-pointer select-none text-muted">
              <ChevronDown size={14} className="group-open/details:rotate-180 transition-transform" />
              References
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
