// frontend/src/components/documents/DocumentUpload.jsx
import React, { useState, useRef, useEffect } from 'react';
import api from '../../services/api.js';
import toast from 'react-hot-toast';
import { UploadCloud, FileText, XCircle, Loader2, CheckCircle, AlertTriangle, Paperclip } from 'lucide-react';
import Button from '../core/Button.jsx'; // Your custom Button

// Define the states and corresponding button texts
const BUTTON_TEXT_STATES = {
    IDLE_NO_FILE: "Select a File",
    IDLE_FILE_SELECTED: "Upload Document",
    UPLOADING_BYTES: "Uploading file...", // Static text during byte transfer phase
    // Cycling messages after byte upload, while Node.js waits for Python
    EXTRACTING_CONTENT: "Extracting content...",
    CLEANING_TEXT: "Cleaning text...",
    ANALYZING_DOCUMENT: "Analyzing document...",
    // After Node.js 202 response (Python call finished from Node's perspective)
    FINALIZING_SUBMISSION: "Finalizing...",
    ERROR: "Upload Failed - Retry?", // Or simply "Upload Failed"
};

// Order for the first cycle of detailed processing messages on the button
const firstCycleButtonMessages = [
    BUTTON_TEXT_STATES.EXTRACTING_CONTENT,
    BUTTON_TEXT_STATES.CLEANING_TEXT,
    BUTTON_TEXT_STATES.ANALYZING_DOCUMENT,
];

// Order for subsequent looping cycles on the button
const loopCycleButtonMessages = [
    BUTTON_TEXT_STATES.CLEANING_TEXT, // Loop starts from "Cleaning..."
    BUTTON_TEXT_STATES.ANALYZING_DOCUMENT,
];

const MESSAGE_BUTTON_DISPLAY_DURATION_MS = 3000; // 3 seconds per message

function DocumentUpload({ onUploadSuccess }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [buttonText, setButtonText] = useState(BUTTON_TEXT_STATES.IDLE_NO_FILE);
    const [errorMessage, setErrorMessage] = useState('');
    const [dragActive, setDragActive] = useState(false); // For dropzone visual feedback

    const fileInputRef = useRef(null);
    const intervalRef = useRef(null);       // Stores the setInterval ID
    const messageIndexRef = useRef(0);    // Current index in the message array
    const currentMessageArrayRef = useRef(firstCycleButtonMessages); // Which array to use (first or loop)
    const isMountedRef = useRef(true);      // Track if component is mounted

    console.log(`[UploadFinalUX] Component Render/Re-render. isProcessing: ${isProcessing}, buttonText: "${buttonText}"`);

    // Effect for component mount and unmount
    useEffect(() => {
        isMountedRef.current = true;
        console.log("[UploadFinalUX] Component Mounted.");
        return () => {
            isMountedRef.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                console.log("[UploadFinalUX] Component Unmounting - Cleared interval:", intervalRef.current);
            }
            console.log("[UploadFinalUX] Component Unmounted.");
        };
    }, []);

    // Effect to manage the cycling of button text messages
    useEffect(() => {
        const clearLocalInterval = (reason = "unspecified") => {
            if (intervalRef.current) {
                console.log(`[UploadFinalUX CycleEffect] Clearing interval (Reason: ${reason}). ID: ${intervalRef.current}`);
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        console.log(`[UploadFinalUX CycleEffect] Evaluating. isProcessing: ${isProcessing}, buttonText: "${buttonText}"`);

        const isCurrentlyInCyclingState =
            buttonText === BUTTON_TEXT_STATES.EXTRACTING_CONTENT ||
            buttonText === BUTTON_TEXT_STATES.CLEANING_TEXT ||
            buttonText === BUTTON_TEXT_STATES.ANALYZING_DOCUMENT;

        if (isProcessing && isCurrentlyInCyclingState) {
            if (!intervalRef.current) { // Only start a new interval if one isn't already running
                console.log(`[UploadFinalUX CycleEffect] Starting new interval. Initial buttonText for cycle: "${buttonText}"`);

                // Determine which array and index to start/resume from
                if (buttonText === BUTTON_TEXT_STATES.EXTRACTING_CONTENT) {
                    currentMessageArrayRef.current = firstCycleButtonMessages;
                    messageIndexRef.current = 0; // Start from the beginning of the first cycle
                } else { // Resuming or starting mid-loop (e.g., if state was restored)
                    const loopIdx = loopCycleButtonMessages.indexOf(buttonText);
                    currentMessageArrayRef.current = loopCycleButtonMessages;
                    messageIndexRef.current = (loopIdx !== -1) ? loopIdx : 0;
                }
                // No need to setButtonText here, as it's already in a cycling state which triggered this.

                intervalRef.current = setInterval(() => {
                    if (!isMountedRef.current || !isProcessing) {
                        clearLocalInterval("component unmounted or no longer processing in interval");
                        return;
                    }

                    messageIndexRef.current++; // Advance to the next message in the current array
                    if (messageIndexRef.current >= currentMessageArrayRef.current.length) {
                        // Reached the end of the current message array, switch to loopCycleMessages
                        currentMessageArrayRef.current = loopCycleButtonMessages;
                        messageIndexRef.current = 0; // Reset index for the loop array
                        console.log("[UploadFinalUX Interval] Switched/Reset to loopCycleMessages. Next message index: 0");
                    }
                    
                    const nextButtonText = currentMessageArrayRef.current[messageIndexRef.current];
                    console.log(`[UploadFinalUX Interval] Setting buttonText to: "${nextButtonText}" (Index: ${messageIndexRef.current} in [${currentMessageArrayRef.current.join(', ')}])`);
                    if (isMountedRef.current) setButtonText(nextButtonText);

                }, MESSAGE_BUTTON_DISPLAY_DURATION_MS);
                console.log(`[UploadFinalUX CycleEffect] Interval started. ID: ${intervalRef.current}. Initial array: [${currentMessageArrayRef.current.join(', ')}]`);
            } else {
                console.log(`[UploadFinalUX CycleEffect] Interval already running for a cycling state. ID: ${intervalRef.current}`);
            }
        } else {
            // If not processing, or if buttonText is not one of the cycling states, clear any existing interval.
            if (intervalRef.current) {
                clearLocalInterval(`not processing or not in cycling state (Text: ${buttonText})`);
            } else {
                // console.log(`[UploadFinalUX CycleEffect] Conditions for cycling NOT met, and no active interval to clear.`);
            }
        }

        return () => { // Cleanup function for this useEffect
            // console.log(`[UploadFinalUX CycleEffect] Cleanup on dep change (isProcessing/buttonText). Current interval ID: ${intervalRef.current}`);
            clearLocalInterval("effect dependency change cleanup");
        };
    }, [isProcessing, buttonText]); // Key dependencies for managing the interval


    const handleFileChange = (e) => {
        console.log("[UploadFinalUX] handleFileChange triggered.");
        if (isProcessing) {
            console.log("[UploadFinalUX] handleFileChange: Currently processing, ignoring file change.");
            return;
        }
        const file = e.target.files && e.target.files[0];
        if (file) {
            setSelectedFile(file);
            setButtonText(BUTTON_TEXT_STATES.IDLE_FILE_SELECTED);
            setErrorMessage('');
            console.log("[UploadFinalUX] handleFileChange: File selected:", file.name);
        } else {
            console.log("[UploadFinalUX] handleFileChange: No file selected or selection cancelled.");
            resetState(); // Resets to IDLE_NO_FILE
        }
    };

    const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); if (isProcessing) return; if (e.type === "dragenter" || e.type === "dragover") setDragActive(true); else if (e.type === "dragleave") setDragActive(false); };
    const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); if (isProcessing) return; setDragActive(false); const file = e.dataTransfer.files && e.dataTransfer.files[0]; if (file) { setSelectedFile(file); setButtonText(BUTTON_TEXT_STATES.IDLE_FILE_SELECTED); setErrorMessage(''); console.log("[UploadFinalUX] handleDrop: File dropped:", file.name); } };

    const handleUpload = async () => {
    if (!selectedFile) {
        toast.error("Please select a file first.");
        return;
    }

    console.log("[UploadFinalUX] handleUpload: Starting upload for", selectedFile.name);
    setIsProcessing(true);
    setButtonText(BUTTON_TEXT_STATES.UPLOADING_BYTES);
    setErrorMessage("");

    // Reset cycling refs
    messageIndexRef.current = 0;
    currentMessageArrayRef.current = firstCycleButtonMessages;

    const formData = new FormData();
    formData.append("file", selectedFile);

    // ─── Fallback: if onUploadProgress never reaches 100%, force EXTRACTING_CONTENT after 500ms ───
    const fallbackTimer = setTimeout(() => {
        if (
        isMountedRef.current &&
        isProcessing &&
        buttonText === BUTTON_TEXT_STATES.UPLOADING_BYTES
        ) {
        console.log(
            "[UploadFinalUX] handleUpload: Forcing EXTRACTING_CONTENT (fallback)."
        );
        setButtonText(BUTTON_TEXT_STATES.EXTRACTING_CONTENT);
        }
    }, 500);
    // ───────────────────────────────────────────────────────────────────────────────────────────

    try {
        console.log("[UploadFinalUX] handleUpload: Calling api.uploadFile");
        await api.uploadFile(formData, (event) => {
        if (isMountedRef.current && isProcessing) {
            if (event.lengthComputable) {
            if (event.loaded === event.total) {
                if (buttonText !== BUTTON_TEXT_STATES.EXTRACTING_CONTENT) {
                console.log(
                    "[UploadFinalUX] onUploadProgress: 100% bytes sent. Setting EXTRACTING_CONTENT."
                );
                setButtonText(BUTTON_TEXT_STATES.EXTRACTING_CONTENT);
                }
                clearTimeout(fallbackTimer);
            }
            } else if (buttonText === BUTTON_TEXT_STATES.UPLOADING_BYTES) {
            console.log(
                "[UploadFinalUX] onUploadProgress: Not computable & still UPLOADING_BYTES. Setting EXTRACTING_CONTENT."
            );
            setButtonText(BUTTON_TEXT_STATES.EXTRACTING_CONTENT);
            clearTimeout(fallbackTimer);
            }
        }
        });

        console.log(
        "[UploadFinalUX] handleUpload: api.uploadFile resolved (Node.js 202 received)."
        );
        clearTimeout(fallbackTimer);

        if (isMountedRef.current && isProcessing) {
        console.log(
            "[UploadFinalUX] handleUpload: Setting buttonText to FINALIZING_SUBMISSION."
        );
        setButtonText(BUTTON_TEXT_STATES.FINALIZING_SUBMISSION);
        }

        if (onUploadSuccess) {
        onUploadSuccess({ originalname: selectedFile.name });
        }
        toast.success(`"${selectedFile.name}" submitted. Background tasks initiated.`);

        setTimeout(() => {
        if (isMountedRef.current) {
            console.log(
            "[UploadFinalUX] handleUpload: Timeout for resetState after FINALIZING_SUBMISSION."
            );
            resetState();
        }
        }, 1500);
    } catch (error) {
        clearTimeout(fallbackTimer);
        console.error("[UploadFinalUX] Upload failed in catch:", error);
        if (isMountedRef.current) {
        const msg =
            error.response?.data?.message || error.message || "Upload processing failed.";
        setErrorMessage(msg);
        setButtonText(BUTTON_TEXT_STATES.ERROR);
        setIsProcessing(false);
        toast.error(`Upload of "${selectedFile.name}" failed.`);
        }
    }
    };



    const resetState = () => {
        console.log("[UploadFinalUX] resetState called.");
        setSelectedFile(null);
        setButtonText(BUTTON_TEXT_STATES.IDLE_NO_FILE);
        setErrorMessage('');
        setIsProcessing(false); // This will trigger CycleEffect to clear interval
        if (fileInputRef.current) {
            fileInputRef.current.value = null;
        }
        setDragActive(false);
        messageIndexRef.current = 0;
        currentMessageArrayRef.current = firstCycleButtonMessages; // Reset for next cycle
        console.log("[UploadFinalUX] resetState: State reset complete.");
    };

    const isButtonUploadActuallyDisabled = !selectedFile || isProcessing;
    const UploadAreaIcon = Paperclip;

    return (
        <div className="mb-4 p-1">
            <label
                htmlFor="file-upload-input"
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center w-full h-36 px-4 transition-colors duration-200 ease-in-out
                            bg-surface-light dark:bg-gray-800
                            border-2 border-dashed rounded-lg cursor-pointer
                            border-border-light dark:border-border-dark
                            hover:border-primary dark:hover:border-primary-light
                            ${isProcessing ? "opacity-60 cursor-not-allowed" : ""}
                            ${dragActive ? "border-primary dark:border-primary-light ring-2 ring-primary dark:ring-primary-light bg-primary/10 dark:bg-primary-dark/20" : ""}`}
            >
                <div className="flex flex-col items-center justify-center text-center">
                    <UploadAreaIcon size={36} className={`mb-2 transition-colors ${dragActive ? 'text-primary dark:text-primary-light' : 'text-text-muted-light dark:text-text-muted-dark'}`} />
                    <p className="mb-1 text-xs sm:text-sm text-text-muted-light dark:text-text-muted-dark">
                        <span className="font-semibold text-primary dark:text-primary-light">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-[0.7rem] sm:text-xs text-text-muted-light dark:text-text-muted-dark">PDF, DOCX, TXT, PPTX, code files</p>
                </div>
                <input ref={fileInputRef} id="file-upload-input" type="file" className="hidden" onChange={handleFileChange}
                       disabled={isProcessing}
                       accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.py,.js,.md,.html,.xml,.json,.csv,.log,.c,.cpp,.java" />
            </label>

            {selectedFile && (
                <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-between text-sm animate-fadeIn">
                    <div className="flex items-center gap-2 truncate">
                        {buttonText === BUTTON_TEXT_STATES.ERROR && errorMessage ?
                            <AlertTriangle size={18} className="text-red-500 flex-shrink-0" /> :
                            <FileText size={18} className="text-primary flex-shrink-0" />
                        }
                        <span className="truncate text-text-light dark:text-text-dark" title={selectedFile.name}>{selectedFile.name}</span>
                        <span className="text-text-muted-light dark:text-text-muted-dark text-xs whitespace-nowrap">
                            ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </span>
                    </div>
                    {!isProcessing && buttonText !== BUTTON_TEXT_STATES.ERROR && (
                        <button onClick={resetState} className="text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors p-1 rounded-full hover:bg-red-500/10">
                            <XCircle size={18} />
                        </button>
                    )}
                </div>
            )}

            {/* Error message display area (if any) */}
            {errorMessage && buttonText === BUTTON_TEXT_STATES.ERROR && (
                 <div className="mt-2 text-xs text-red-600 dark:text-red-400 p-2 bg-red-500/10 rounded-md flex justify-center items-center h-auto">
                    <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" />
                    <span className="flex-grow text-center">{errorMessage.substring(0,100)}</span>
                 </div>
            )}

            <Button
                onClick={handleUpload}
                fullWidth
                className="mt-3 text-sm min-h-[38px]" // min-height to prevent button size jumping due to text length
                variant="primary"
                isLoading={isProcessing} // Button component shows its spinner when true
                disabled={isButtonUploadActuallyDisabled}
                leftIcon={!isProcessing && buttonText !== BUTTON_TEXT_STATES.ERROR ? <UploadCloud size={16} /> : null}
            >
                {/* The button's text is now directly from the buttonText state */}
                {buttonText}
            </Button>
        </div>
    );
}
export default DocumentUpload;