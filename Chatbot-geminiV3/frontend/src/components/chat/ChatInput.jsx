import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, PlusCircle, Loader2, SearchCheck, SearchSlash } from 'lucide-react'; // SearchCheck for RAG on, SearchSlash for RAG off
import { useWebSpeech } from '../../hooks/useWebSpeech'; // You'll need to create this hook

function ChatInput({ onSendMessage, isLoading, currentStatus, useRag, setUseRag }) {
    const [inputValue, setInputValue] = useState('');
    const { transcript, listening, isSpeechSupported, startListening, stopListening, resetTranscript } = useWebSpeech();
    const textareaRef = useRef(null);

    useEffect(() => {
        if (transcript) {
            setInputValue(prev => prev + (prev ? " " : "") + transcript);
            resetTranscript(); // Clear transcript after appending
        }
    }, [transcript, resetTranscript]);
    
    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'; // Reset height
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`; // Set to scroll height
        }
    }, [inputValue]);


    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue.trim() && !isLoading) {
            onSendMessage(inputValue);
            setInputValue('');
        }
    };

    const toggleVoiceInput = () => {
        if (listening) {
            stopListening();
        } else {
            startListening();
        }
    };

    return (
        <div className="p-2 sm:p-4 border-t border-gray-200 dark:border-gray-700 bg-surface-light dark:bg-surface-dark">
            {/* Status Bar */}
            <div className="text-xs text-text-muted-light dark:text-text-muted-dark mb-1.5 h-4 transition-opacity duration-300">
                {isLoading ? (
                    <span className="flex items-center gap-1 animate-pulse">
                        <Loader2 size={12} className="animate-spin" /> {currentStatus || "Processing..."}
                    </span>
                ) : (
                    currentStatus || "Ready"
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex items-end gap-2">
                {/* Attachment/Plus Button - Placeholder */}
                <button
                    type="button"
                    title="Attach file (Coming Soon)"
                    onClick={() => alert("Attachment feature coming soon!")}
                    className="p-2.5 rounded-lg text-text-muted-light dark:text-text-muted-dark hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
                >
                    <PlusCircle size={22} />
                </button>

                <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
                            handleSubmit(e);
                        }
                    }}
                    placeholder="DeepResearch... Type your message or ask a question"
                    className="flex-1 p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-text-light dark:text-text-dark focus:ring-2 focus:ring-primary focus:border-transparent outline-none resize-none min-h-[44px] max-h-32 custom-scrollbar text-sm"
                    rows="1"
                    disabled={isLoading}
                />

                {isSpeechSupported && (
                    <button
                        type="button"
                        onClick={toggleVoiceInput}
                        title={listening ? "Stop listening" : "Start voice input"}
                        className={`p-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                            listening 
                            ? 'bg-red-500 text-white animate-pulse' 
                            : 'text-text-muted-light dark:text-text-muted-dark hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                    >
                        <Mic size={20} />
                    </button>
                )}
                
                {/* RAG Toggle Button */}
                <button
                    type="button"
                    onClick={() => setUseRag(!useRag)}
                    title={useRag ? "Disable RAG (Chat with LLM directly)" : "Enable RAG (Use your documents)"}
                    className={`p-2.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                        useRag 
                        ? 'bg-green-500 text-white' 
                        : 'text-text-muted-light dark:text-text-muted-dark hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    disabled={isLoading}
                >
                    {useRag ? <SearchCheck size={20} /> : <SearchSlash size={20} />}
                </button>

                <button
                    type="submit"
                    className="p-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-75 disabled:opacity-50"
                    disabled={isLoading || !inputValue.trim()}
                >
                    <Send size={20} />
                </button>
            </form>
        </div>
    );
}
export default ChatInput;