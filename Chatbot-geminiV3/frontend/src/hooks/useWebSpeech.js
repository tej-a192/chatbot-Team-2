import { useState, useEffect, useCallback } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const useWebSpeech = () => {
    const [transcript, setTranscript] = useState('');
    const [listening, setListening] = useState(false);
    const [recognitionInstance, setRecognitionInstance] = useState(null);
    const isSpeechSupported = !!SpeechRecognition;

    useEffect(() => {
        if (!isSpeechSupported) {
            console.warn("Web Speech API is not supported by this browser.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false; // Set to true if you want it to keep listening
        recognition.interimResults = false; // Set to true for live results
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const currentTranscript = Array.from(event.results)
                .map(result => result[0])
                .map(result => result.transcript)
                .join('');
            setTranscript(currentTranscript);
            // console.log("Voice input result:", currentTranscript);
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            // Handle common errors like 'no-speech', 'audio-capture', 'not-allowed'
            if (event.error === 'not-allowed') {
                alert("Microphone permission denied. Please allow microphone access in your browser settings.");
            }
            setListening(false);
        };

        recognition.onend = () => {
            setListening(false);
            // console.log("Speech recognition ended.");
        };
        
        setRecognitionInstance(recognition);

        // Cleanup
        return () => {
            if (recognition) {
                recognition.stop();
            }
        };
    }, [isSpeechSupported]);

    const startListening = useCallback(() => {
        if (recognitionInstance && !listening) {
            try {
                setTranscript(''); // Clear previous transcript
                recognitionInstance.start();
                setListening(true);
                // console.log("Speech recognition started.");
            } catch (e) {
                console.error("Error starting speech recognition:", e);
                setListening(false); // Ensure listening state is correct
            }
        }
    }, [recognitionInstance, listening]);

    const stopListening = useCallback(() => {
        if (recognitionInstance && listening) {
            recognitionInstance.stop();
            setListening(false); // Manually set as onend might be delayed
            // console.log("Speech recognition stopped manually.");
        }
    }, [recognitionInstance, listening]);

    const resetTranscript = useCallback(() => {
        setTranscript('');
    }, []);


    return {
        transcript,
        listening,
        isSpeechSupported,
        startListening,
        stopListening,
        resetTranscript
    };
};