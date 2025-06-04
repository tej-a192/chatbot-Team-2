// src/hooks/useWebSpeech.js
// This version uses the browser's built-in SpeechRecognition API
import { useState, useEffect, useCallback, useRef } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const useWebSpeech = () => {
    const [transcript, setTranscript] = useState(''); 
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef(null);
    const [error, setError] = useState(null);
    const [isSpeechSupported, setIsSpeechSupported] = useState(false);
    const stopTimeoutRef = useRef(null);

    const destroyRecognitionInstance = useCallback(() => {
        console.log("useWebSpeech: destroyRecognitionInstance called.");
        if (recognitionRef.current) {
            recognitionRef.current.onstart = null;
            recognitionRef.current.onresult = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.onend = null;
            recognitionRef.current.abort();
            recognitionRef.current = null;
            console.log("useWebSpeech: Recognition instance nullified.");
        }
        if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
    }, []);
    
    const createAndSetupRecognitionInstance = useCallback(() => {
        if (!SpeechRecognition) {
            console.error("useWebSpeech: createAndSetup - SpeechRecognition not supported.");
            setIsSpeechSupported(false);
            return null;
        }
        
        if (recognitionRef.current) {
            console.log("useWebSpeech: createAndSetup - Destroying existing instance.");
            destroyRecognitionInstance();
        }

        console.log("useWebSpeech: Creating NEW SpeechRecognition instance.");
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.continuous = false; 
        recognition.interimResults = true; 

        recognition.onstart = () => {
            console.log("useWebSpeech: EVENT - onstart");
            if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
            setListening(true);
            setError(null);
            setTranscript(''); 
            console.log("useWebSpeech: onstart - transcript cleared, listening set to true.");
        };

        recognition.onresult = (event) => {
            console.log("useWebSpeech: EVENT - onresult FIRED!", event);
            if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
            
            let recognizedTextInEvent = "";
            let isThisSegmentFinal = false;

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const segment = event.results[i];
                const text = segment[0]?.transcript || "";
                console.log(`useWebSpeech: onresult - Segment ${i}: Text: "${text}", isFinal: ${segment.isFinal}`);
                
                if (text) recognizedTextInEvent = text; 
                if (segment.isFinal) isThisSegmentFinal = true;
            }

            recognizedTextInEvent = recognizedTextInEvent.trim();
            if (recognizedTextInEvent) {
                console.log(`useWebSpeech: onresult - Updating transcript state to: "${recognizedTextInEvent}" (isFinal in this event: ${isThisSegmentFinal})`);
                setTranscript(recognizedTextInEvent); 
            } else {
                console.log("useWebSpeech: onresult - No usable text in this event.");
            }
        };

        recognition.onerror = (event) => {
            console.error("useWebSpeech: EVENT - onerror", event.error, event.message);
            if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
            setError(`Speech Error: ${event.error}. ${event.message || ''}`);
            setListening(false); 
        };

        recognition.onend = () => {
            console.log("useWebSpeech: EVENT - onend. Listening state before onend:", listening);
            if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current);
            setListening(false);
            console.log("useWebSpeech: onend - Final transcript state:", `"${transcript}"`);
        };
        
        recognitionRef.current = recognition;
        return recognition;
    }, [destroyRecognitionInstance, listening, transcript]);

    useEffect(() => {
        if (!SpeechRecognition) {
            setIsSpeechSupported(false);
            return;
        }
        setIsSpeechSupported(true);
        if (!recognitionRef.current) {
            createAndSetupRecognitionInstance();
        }
        return () => {
            destroyRecognitionInstance();
        };
    }, [createAndSetupRecognitionInstance, destroyRecognitionInstance]);

    const startListening = useCallback(() => {
        if (!isSpeechSupported) { setError("Speech recognition not supported."); return; }
        let currentRecognition = recognitionRef.current;
        if (!currentRecognition) {
            currentRecognition = createAndSetupRecognitionInstance();
            if (!currentRecognition) { setError("Failed to initialize speech service."); return; }
        }
        if (currentRecognition && !listening) {
            try {
                currentRecognition.start();
            } catch (e) {
                setError(`Mic Error: ${e.message}.`);
                setListening(false);
                destroyRecognitionInstance(); 
                createAndSetupRecognitionInstance(); 
            }
        }
    }, [isSpeechSupported, listening, createAndSetupRecognitionInstance, destroyRecognitionInstance]);

    const stopListening = useCallback(() => {
        if (stopTimeoutRef.current) clearTimeout(stopTimeoutRef.current); 

        if (recognitionRef.current && listening) {
            recognitionRef.current.stop(); 
            
            stopTimeoutRef.current = setTimeout(() => {
                if (listening) { 
                    console.warn("useWebSpeech: stopListening - Timeout after stop(), forcing cleanup.");
                    setListening(false);
                    destroyRecognitionInstance(); 
                    createAndSetupRecognitionInstance();  
                }
            }, 1000); 
        } else {
            if (!listening && recognitionRef.current) { 
                setListening(false); 
            } else if (!recognitionRef.current) {
                createAndSetupRecognitionInstance();
            }
        }
    }, [listening, createAndSetupRecognitionInstance, destroyRecognitionInstance]);

    const clearHookTranscriptState = useCallback(() => {
        setTranscript('');
    }, []);

    return {
        transcript,
        listening,
        isSpeechSupported, // Note: this is 'isSpeechSupported'
        startListening,
        stopListening,
        resetTranscript: clearHookTranscriptState,
        error
    };
};