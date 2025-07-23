// frontend/src/hooks/useTypingEffect.js
import { useState, useEffect, useRef } from 'react';
import GraphemeSplitter from 'grapheme-splitter';

export const useTypingEffect = (textToType, speed = 20, onComplete) => {
    const [displayedText, setDisplayedText] = useState('');
    const onCompleteRef = useRef(onComplete);

    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        if (textToType) {
            const splitter = new GraphemeSplitter();
            const graphemes = splitter.splitGraphemes(textToType);
            let index = 0;
            setDisplayedText('');

            const intervalId = setInterval(() => {
                if (index < graphemes.length) {
                    setDisplayedText(prev => prev + graphemes[index]);
                    index++;
                } else {
                    clearInterval(intervalId);
                    if (onCompleteRef.current) {
                        onCompleteRef.current();
                    }
                }
            }, speed);
            
            return () => clearInterval(intervalId);
        } else {
            setDisplayedText('');
        }
    }, [textToType, speed]);

    return displayedText;
};