// frontend/src/components/chat/StreamingResponse.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ThinkingDropdown from './ThinkingDropdown';
import TypingIndicator from './TypingIndicator';
import { useTypingEffect } from '../../hooks/useTypingEffect';

function StreamingResponse({ streamingResponse }) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const [completedTyping, setCompletedTyping] = useState('');
    const [currentTyping, setCurrentTyping] = useState('');
    const [isWaitingForNextChunk, setIsWaitingForNextChunk] = useState(false);
    const lastStreamedContentRef = useRef('');

    useEffect(() => {
        if (streamingResponse?.thinking && !isDropdownOpen) {
            setIsDropdownOpen(true);
        }
    }, [streamingResponse?.thinking, isDropdownOpen]);

    // This effect detects when NEW text arrives from the server
    useEffect(() => {
        if (streamingResponse?.thinking && streamingResponse.thinking.length > lastStreamedContentRef.current.length) {
            const newChunk = streamingResponse.thinking.substring(lastStreamedContentRef.current.length);
            setCurrentTyping(newChunk); // Only set the NEW chunk to be typed
            setIsWaitingForNextChunk(false);
            lastStreamedContentRef.current = streamingResponse.thinking;
        }
    }, [streamingResponse?.thinking]);
    
    // This callback runs when the animation for the CURRENT chunk is done
    const handleTypingComplete = useCallback(() => {
        // Move the newly typed text to the permanent, completed buffer
        setCompletedTyping(prev => prev + currentTyping);
        setCurrentTyping(''); // Clear the chunk to be typed
        
        // Show "Thinking..." if the stream is still active
        if (streamingResponse?.isThinkingStreaming) {
            setIsWaitingForNextChunk(true);
        }
    }, [currentTyping, streamingResponse?.isThinkingStreaming]);
    
    const animatedCurrentChunk = useTypingEffect(currentTyping, 4, handleTypingComplete);

    if (!streamingResponse) return null;

    const { thinking, isThinkingStreaming } = streamingResponse;
    const showThinking = thinking !== null;

    return (
        <div className="flex flex-col items-start w-full group space-y-1.5">
            {showThinking && (
                <div className="max-w-[85%] md:max-w-[75%] w-full">
                    <ThinkingDropdown
                        isOpen={isDropdownOpen}
                        setIsOpen={setIsDropdownOpen}
                        isStreaming={isThinkingStreaming}
                    >
                        <pre className="text-xs text-text-muted-light dark:text-text-muted-dark whitespace-pre-wrap font-sans leading-relaxed">
                            {/* Render the buffer + the currently animating chunk */}
                            {completedTyping}{animatedCurrentChunk}
                            {isWaitingForNextChunk && <span className="animate-pulse"> Thinking...</span>}
                        </pre>
                    </ThinkingDropdown>
                </div>
            )}
            <TypingIndicator />
        </div>
    );
}

export default StreamingResponse;