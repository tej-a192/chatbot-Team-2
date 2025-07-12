// frontend/src/hooks/useTypingEffect.js
import { useState, useEffect, useRef } from 'react';

/**
 * A custom hook to create a typing animation effect for text.
 * @param {string} textToType The full string that should be typed out.
 * @param {number} [speed=20] The delay in milliseconds between each character.
 * @param {function} [onComplete] An optional callback to run when typing is finished.
 * @returns {string} The currently displayed text (which grows over time).
 */
export const useTypingEffect = (textToType, speed = 20, onComplete) => {
    const [displayedText, setDisplayedText] = useState('');
    const index = useRef(0);
    const onCompleteRef = useRef(onComplete);

    // Keep the onComplete callback reference fresh
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        // Reset the typing effect when the text to type changes
        setDisplayedText('');
        index.current = 0;

        const intervalId = setInterval(() => {
            if (index.current < textToType.length) {
                setDisplayedText(prev => prev + textToType.charAt(index.current));
                index.current++;
            } else {
                clearInterval(intervalId);
                if (onCompleteRef.current) {
                    onCompleteRef.current(); // Call the onComplete callback
                }
            }
        }, speed);

        return () => clearInterval(intervalId);
    }, [textToType, speed]);

    return displayedText;
};