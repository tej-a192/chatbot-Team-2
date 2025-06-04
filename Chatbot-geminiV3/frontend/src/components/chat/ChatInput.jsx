// src/components/chat/ChatInput.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Send, Mic, PlusCircle, Loader2, SearchCheck, SearchSlash, Brain } from 'lucide-react';
import { useWebSpeech } from '../../hooks/useWebSpeech'; // <--- MAKE SURE THIS IS useWebSpeech
import Button from '../core/Button.jsx';
import IconButton from '../core/IconButton.jsx';
import toast from 'react-hot-toast';

function ChatInput({ 
    onSendMessage, 
    isLoading, 
    currentStatus, 
    useRag, 
    setUseRag,
    criticalThinkingEnabled,
    setCriticalThinkingEnabled 
}) {
    const [inputValue, setInputValue] = useState(''); 
    const { 
        transcript, 
        listening, 
        isSpeechSupported, // <--- USE THIS NAME
        startListening, 
        stopListening, 
        resetTranscript, 
        error: speechError // <--- USE THIS NAME
    } = useWebSpeech();    // <--- USE THIS HOOK
    const textareaRef = useRef(null);

    // Effect to update inputValue based on the hook's live transcript
    useEffect(() => {
        if (listening) {
            // When listening, inputValue directly reflects the hook's transcript
            console.log("ChatInput: Listening is true. Setting inputValue to hook's transcript:", `"${transcript}"`);
            setInputValue(transcript);
        } else if (!listening && transcript && inputValue !== transcript) {
            // After listening stops, if transcript from hook has the final value, update inputValue
            console.log("ChatInput: Listening stopped. Setting inputValue to final transcript:", `"${transcript}"`);
            setInputValue(transcript);
            // The hook's transcript will be cleared on the *next* onstart.
            // We don't call resetTranscript() here anymore to ensure the final value is available.
        } else if (!listening && !transcript && inputValue) {
            // If listening stopped, hook's transcript is empty (e.g. cleared on next start),
            // but inputValue might still have old STT text, we might want to clear it
            // or let user manage. For now, let user manage.
            // If we wanted to clear inputValue when STT session *ends* and yields no transcript:
            // setInputValue('');
        }
    }, [transcript, listening, inputValue]); 
    
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 128)}px`;
        }
    }, [inputValue]);

    useEffect(() => {
        if (speechError) { // Use speechError
            console.error("ChatInput: Displaying speech error toast:", speechError);
            toast.error(`Speech: ${speechError}`, { id: 'speech-error-toast', duration: 5000 });
        }
    }, [speechError]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const textToSend = inputValue.trim();
        if (textToSend && !isLoading) {
            onSendMessage(textToSend, criticalThinkingEnabled);
            setInputValue(''); 
            // No need to call resetTranscript here; hook handles it on next 'onstart'
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const toggleListening = () => {
        if (!isSpeechSupported) { // Use isSpeechSupported
            toast.error("Speech recognition is not supported in your browser.");
            return;
        }
        if (listening) {
            stopListening();
        } else {
            // When starting, the hook's onstart will clear its transcript.
            // This useEffect([transcript, listening]) will then update inputValue to empty.
            startListening();
        }
    };

    const handleInputChange = (e) => {
        setInputValue(e.target.value);
    };

    let displayStatus = currentStatus || "Ready";
    if (isLoading) { 
        displayStatus = currentStatus || "Processing...";
    } else if (listening) { 
        displayStatus = "Listening..."; // Simpler status text
    }

    return (
        <div className="p-2 sm:p-3 border-t border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
            <div className="text-xs text-text-muted-light dark:text-text-muted-dark mb-1.5 h-4 transition-opacity duration-300">
                {isLoading && !listening ? ( 
                    <span className="flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" /> {displayStatus}
                    </span>
                ) : (
                    displayStatus
                )}
            </div>

            <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <IconButton
                    icon={PlusCircle}
                    title="Attach file (Coming Soon)"
                    onClick={() => toast.info("Attachment feature coming soon!")}
                    variant="ghost"
                    size="md"
                    className="p-2 text-text-muted-light dark:text-text-muted-dark hover:text-primary"
                    disabled={isLoading || listening}
                />

                <textarea
                    ref={textareaRef}
                    value={inputValue} 
                    onChange={handleInputChange} 
                    onKeyDown={handleKeyDown}
                    placeholder="Type or speak your message..."
                    className="input-field flex-1 p-2.5 resize-none min-h-[44px] max-h-32 custom-scrollbar text-sm"
                    rows="1"
                    disabled={isLoading} 
                />

                {isSpeechSupported && ( // Use isSpeechSupported
                    <IconButton
                        icon={Mic}
                        onClick={toggleListening} 
                        title={listening ? "Stop listening" : "Start voice input"}
                        variant={listening ? "danger" : "ghost"}
                        size="md"
                        className={`p-2 ${listening ? 'text-red-500 dark:text-red-400 animate-pulse' : 'text-text-muted-light dark:text-text-muted-dark hover:text-primary'}`}
                        disabled={isLoading} 
                    />
                )}
                
                <IconButton 
                    icon={useRag ? SearchCheck : SearchSlash}
                    onClick={() => setUseRag(!useRag)}
                    title={useRag ? "Disable RAG (Search documents)" : "Enable RAG (Search documents)"}
                    variant="ghost"
                    size="md"
                    className={`p-2 ${useRag ? 'text-green-500 dark:text-green-400' : 'text-text-muted-light dark:text-text-muted-dark hover:text-primary'}`}
                    disabled={isLoading || listening}
                />
                
                <IconButton
                    icon={Brain} 
                    onClick={() => setCriticalThinkingEnabled(!criticalThinkingEnabled)}
                    title={criticalThinkingEnabled ? "Disable Critical Thinking (KG)" : "Enable Critical Thinking (KG)"}
                    variant="ghost"
                    size="md"
                    className={`p-2 ${criticalThinkingEnabled ? 'text-purple-500 dark:text-purple-400' : 'text-text-muted-light dark:text-text-muted-dark hover:text-primary'}`}
                    disabled={isLoading || listening}
                />

                <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="!p-2.5"
                    disabled={isLoading || listening || !inputValue.trim()}
                    isLoading={isLoading && inputValue.trim()}
                    title="Send message"
                >
                    {!(isLoading && inputValue.trim()) ? <Send size={20} /> : null}
                </Button>
            </form>
        </div>
    );
}
export default ChatInput;