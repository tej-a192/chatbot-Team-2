// src/components/chat/ChatInput.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, PlusCircle, Loader2, SearchCheck, SearchSlash } from 'lucide-react';
import { useWebSpeech } from '../../hooks/useWebSpeech';
import Button from '../core/Button.jsx'; // Assuming you might want to use your Button component
import IconButton from '../core/IconButton.jsx';

function ChatInput({ onSendMessage, isLoading, currentStatus, useRag, setUseRag }) {
    const [inputValue, setInputValue] = useState('');
    const { transcript, listening, isSpeechSupported, startListening, stopListening, resetTranscript } = useWebSpeech();
    const textareaRef = useRef(null);

    useEffect(() => {
        if (transcript) {
            setInputValue(prev => prev + (prev ? " " : "") + transcript);
            resetTranscript(); 
        }
    }, [transcript, resetTranscript]);
    
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`; // Max height 128px (max-h-32)
        }
    }, [inputValue]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue.trim() && !isLoading) {
            onSendMessage(inputValue.trim());
            setInputValue('');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
            e.preventDefault(); // Prevent newline in textarea
            handleSubmit(e);
        }
    };

    return (
        <div className="p-2 sm:p-3 border-t border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
            <div className="text-xs text-text-muted-light dark:text-text-muted-dark mb-1.5 h-4 transition-opacity duration-300">
                {isLoading ? (
                    <span className="flex items-center gap-1"> {/* Removed animate-pulse from span */}
                        <Loader2 size={12} className="animate-spin" /> {currentStatus || "Processing..."}
                    </span>
                ) : (
                    currentStatus || "Ready"
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <IconButton
                    icon={PlusCircle}
                    title="Attach file (Coming Soon)"
                    onClick={() => toast.info("Attachment feature coming soon!")}
                    variant="ghost"
                    size="md" // Standardize icon button size
                    className="p-2 text-text-muted-light dark:text-text-muted-dark hover:text-primary"
                    disabled={isLoading}
                />

                <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your message or ask a question..."
                    className="input-field flex-1 p-2.5 resize-none min-h-[44px] max-h-32 custom-scrollbar text-sm" // Uses your global input-field
                    rows="1"
                    disabled={isLoading}
                />

                {isSpeechSupported && (
                    <IconButton
                        icon={Mic}
                        onClick={() => listening ? stopListening() : startListening()}
                        title={listening ? "Stop listening" : "Start voice input"}
                        variant={listening ? "danger" : "ghost"} // Example: use danger variant when listening
                        size="md"
                        className={`p-2 ${listening ? 'text-red-500 dark:text-red-400 animate-pulse' : 'text-text-muted-light dark:text-text-muted-dark hover:text-primary'}`}
                        disabled={isLoading}
                    />
                )}
                
                <IconButton
                    icon={useRag ? SearchCheck : SearchSlash}
                    onClick={() => setUseRag(!useRag)}
                    title={useRag ? "Disable RAG (Chat with LLM directly)" : "Enable RAG (Use your documents)"}
                    variant="ghost"
                    size="md"
                    className={`p-2 ${useRag ? 'text-green-500 dark:text-green-400' : 'text-text-muted-light dark:text-text-muted-dark hover:text-primary'}`}
                    disabled={isLoading}
                />

                <Button // Using your Button component
                    type="submit"
                    variant="primary"
                    size="md" // Adjust size if needed, IconButton uses p-2 which is md for Button typically
                    className="!p-2.5" // Override padding to match IconButton if desired
                    disabled={isLoading || !inputValue.trim()}
                    isLoading={isLoading && inputValue.trim()} // Show loader on button only if it's this button causing load
                    title="Send message"
                >
                    {!isLoading || !inputValue.trim() ? <Send size={20} /> : null}
                </Button>
            </form>
        </div>
    );
}
export default ChatInput;