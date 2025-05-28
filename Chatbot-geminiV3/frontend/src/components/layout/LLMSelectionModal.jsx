// frontend/src/components/layout/LLMSelectionModal.jsx
import React, { useState, useEffect } from 'react';
import { useAppState } from '../../contexts/AppStateContext.jsx';
import api from '../../services/api.js'; // For V1, this is mocked
import toast from 'react-hot-toast';
import { X, Save, KeyRound, Link2, AlertCircle } from 'lucide-react';
import Modal from '../core/Modal.jsx'; // Using the generic Modal component
import Button from '../core/Button.jsx';
import LLMSelection from '../auth/LLMSelection.jsx';
import { motion } from 'framer-motion';

function LLMSelectionModal({ isOpen, onClose, currentLLM, onSelectLLM }) {
    // This component now acts as the content provider for the generic Modal
    const { switchLLM: setGlobalLLMPreference } = useAppState();
    
    const [locallySelectedLLM, setLocallySelectedLLM] = useState(currentLLM);
    const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
    const [ollamaApiUrlInput, setOllamaApiUrlInput] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setLocallySelectedLLM(currentLLM); // Sync with global when modal opens
            setGeminiApiKeyInput(''); 
            setOllamaApiUrlInput(''); 
            setError('');
        }
    }, [isOpen, currentLLM]);

    const handleSavePreference = async () => {
        setLoading(true); 
        setError('');
        const toastId = toast.loading('Saving LLM preference...');
        try {
            const configData = { llmProvider: locallySelectedLLM };
            if (locallySelectedLLM === 'gemini' && geminiApiKeyInput.trim()) {
                configData.apiKey = geminiApiKeyInput.trim();
            }
            if (locallySelectedLLM === 'ollama' && ollamaApiUrlInput.trim()) {
                configData.ollamaUrl = ollamaApiUrlInput.trim();
            }
            
            await api.updateUserLLMConfig(configData); // Mocked in V1
            
            setGlobalLLMPreference(locallySelectedLLM); // Update global AppStateContext
            if(onSelectLLM) onSelectLLM(locallySelectedLLM); // Inform parent (TopNav) if needed

            toast.dismiss(toastId);
            toast.success(`LLM preference updated to ${locallySelectedLLM.toUpperCase()} (mocked).`);
            onClose(); // Close the modal
        } catch (err) {
            toast.dismiss(toastId);
            const errorMessage = err.response?.data?.message || err.message || 'Failed to update LLM preference.';
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };
    
    const inputWrapperClass = "relative";
    const inputIconClass = "absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted-light dark:text-text-muted-dark pointer-events-none";
    const inputFieldStyledClass = "input-field pl-10 py-2 text-sm";

    return (
         <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Switch LLM Provider" 
            size="lg"
            footerContent={ // Pass footer buttons to the generic Modal
                <>
                    <Button variant="ghost" onClick={onClose} disabled={loading} className="text-sm">Cancel</Button>
                    <Button onClick={handleSavePreference} isLoading={loading} className="text-sm" leftIcon={<Save size={16}/>}>
                        Save Preference
                    </Button>
                </>
            }
        >
            {/* This is the children prop for the generic Modal */}
            <div className="space-y-5"> 
                <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
                    Select your preferred Large Language Model. Your choice will be saved for future sessions. (V1 uses mock data regardless).
                </p>
                <LLMSelection 
                    selectedLLM={locallySelectedLLM} 
                    onLlmChange={setLocallySelectedLLM}
                    disabled={loading}
                />
                {locallySelectedLLM === 'gemini' && (
                    <motion.div 
                        key="gemini-config-modal" 
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mt-4 space-y-1 overflow-hidden"
                    >
                        <label htmlFor="modalGeminiApiKey" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark mb-1">
                            Gemini API Key (Optional - Enter to update)
                        </label>
                        <div className={inputWrapperClass}>
                            <KeyRound className={inputIconClass} />
                            <input
                                type="password"
                                id="modalGeminiApiKey"
                                className={inputFieldStyledClass}
                                placeholder="Leave blank to use existing/default"
                                value={geminiApiKeyInput}
                                onChange={(e) => setGeminiApiKeyInput(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </motion.div>
                )}
                {locallySelectedLLM === 'ollama' && (
                    <motion.div 
                        key="ollama-config-modal" 
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="mt-4 space-y-1 overflow-hidden"
                    >
                        <label htmlFor="modalOllamaUrl" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark mb-1">
                            Ollama API URL (Optional - Enter to update)
                        </label>
                         <div className={inputWrapperClass}>
                            <Link2 className={inputIconClass} />
                            <input
                                type="text"
                                id="modalOllamaUrl"
                                className={inputFieldStyledClass}
                                placeholder="Default (usually http://localhost:11434)"
                                value={ollamaApiUrlInput}
                                onChange={(e) => setOllamaApiUrlInput(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                    </motion.div>
                )}
                {/* Corrected error display */}
                {error && (
                    <div className="p-3 mt-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 rounded-md text-sm flex items-center gap-2 animate-fadeIn">
                        <AlertCircle size={18}/> {error}
                    </div>
                )}
            </div>
        </Modal>
    );
}

export default LLMSelectionModal;