// import React, { useState, useEffect } from 'react';
// import { X, HardDrive, Cloud, Save, AlertCircle } from 'lucide-react';
// import api from '../../services/api';
// import toast from 'react-hot-toast';
// import { useAppState } from '../../contexts/AppStateContext';

// function LLMSelectionModal({ isOpen, onClose, currentLLM, onSelectLLM }) {
//     const { switchLLM: setGlobalLLM } = useAppState();
//     const [selectedProvider, setSelectedProvider] = useState(currentLLM);
//     const [geminiApiKey, setGeminiApiKey] = useState('');
//     const [loading, setLoading] = useState(false);
//     const [error, setError] = useState('');

//     useEffect(() => {
//         setSelectedProvider(currentLLM); // Sync with global state when modal opens
//         setGeminiApiKey(''); // Clear API key field
//         setError('');
//     }, [isOpen, currentLLM]);

//     const handleSave = async () => {
//         setLoading(true);
//         setError('');
//         toast.loading('Saving LLM preference...');

//         try {
//             if (selectedProvider === 'gemini' && !geminiApiKey.trim()) {
//                 // If switching to Gemini and no API key is provided, we can still switch
//                 // but the Gemini functionality will fail if the backend doesn't have a key.
//                 // OR, enforce API key input here if that's the desired flow.
//                 // For now, let's allow switching and let backend handle key presence.
//                 // A better UX might be to prompt for the key only if it's not already configured.
//             }
            
//             // Call backend to update user's LLM preference & API key if provided
//             // Backend needs to securely store this.
//             await api.updateUserLLMConfig({ 
//                 llmProvider: selectedProvider, 
//                 apiKey: selectedProvider === 'gemini' ? geminiApiKey.trim() : undefined 
//             });

//             setGlobalLLM(selectedProvider); // Update global app state
//             onSelectLLM(selectedProvider); // Inform parent (TopNav)
//             toast.dismiss();
//             toast.success(`Switched to ${selectedProvider.toUpperCase()} LLM.`);
//             onClose();
//         } catch (err) {
//             toast.dismiss();
//             const errorMessage = err.response?.data?.message || err.message || 'Failed to update LLM preference.';
//             setError(errorMessage);
//             toast.error(errorMessage);
//         } finally {
//             setLoading(false);
//         }
//     };

//     if (!isOpen) return null;

//     return (
//         <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 animate-fadeIn">
//             <div className="bg-surface-light dark:bg-surface-dark p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-lg transform transition-all">
//                 <div className="flex justify-between items-center mb-6">
//                     <h2 className="text-xl font-semibold text-text-light dark:text-text-dark">
//                         Switch LLM Provider
//                     </h2>
//                     <button onClick={onClose} className="text-text-muted-light dark:text-text-muted-dark hover:text-red-500 transition-colors">
//                         <X size={24} />
//                     </button>
//                 </div>

//                 {error && <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 rounded-md text-sm flex items-center gap-2"><AlertCircle size={18}/> {error}</div>}

//                 <div className="space-y-4">
//                     <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
//                         Select your preferred Large Language Model provider. Your choice will be saved for future sessions.
//                     </p>
                    
//                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//                         {['ollama', 'gemini'].map(provider => (
//                             <button
//                                 key={provider}
//                                 type="button"
//                                 onClick={() => setSelectedProvider(provider)}
//                                 className={`p-4 border rounded-lg text-left transition-all duration-150 focus:outline-none
//                                     ${selectedProvider === provider 
//                                         ? 'bg-primary-light dark:bg-primary-dark border-primary dark:border-primary-light ring-2 ring-primary dark:ring-primary-light shadow-lg' 
//                                         : 'bg-surface-light dark:bg-surface-dark border-gray-300 dark:border-gray-600 hover:border-primary-light dark:hover:border-primary-dark hover:shadow-md'
//                                     }`}
//                             >
//                                 <div className="flex items-center mb-1">
//                                     {provider === 'ollama' ? <HardDrive size={20} className={`mr-2 ${selectedProvider === provider ? 'text-primary dark:text-primary-light' : 'text-text-muted-light dark:text-text-muted-dark'}`} /> : <Cloud size={20} className={`mr-2 ${selectedProvider === provider ? 'text-primary dark:text-primary-light' : 'text-text-muted-light dark:text-text-muted-dark'}`} />}
//                                     <span className={`font-semibold ${selectedProvider === provider ? 'text-primary dark:text-primary-light' : 'text-text-light dark:text-text-dark'}`}>
//                                         {provider.toUpperCase()} LLM
//                                     </span>
//                                 </div>
//                                 <p className={`text-xs ${selectedProvider === provider ? 'text-primary-dark dark:text-primary' : 'text-text-muted-light dark:text-text-muted-dark'}`}>
//                                     {provider === 'ollama' ? 'Local & Private. Requires Ollama running.' : 'Cloud-based by Google. API Key may be required.'}
//                                 </p>
//                             </button>
//                         ))}
//                     </div>

//                     {selectedProvider === 'gemini' && (
//                         <div className="mt-4">
//                             <label htmlFor="modalGeminiApiKey" className="block text-sm font-medium text-text-light dark:text-text-dark mb-1">
//                                 Gemini API Key (if not already configured)
//                             </label>
//                             <input
//                                 type="password"
//                                 id="modalGeminiApiKey"
//                                 className="input-custom"
//                                 placeholder="Enter new or update existing Gemini API Key"
//                                 value={geminiApiKey}
//                                 onChange={(e) => setGeminiApiKey(e.target.value)}
//                                 disabled={loading}
//                             />
//                             <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
//                                 Leave blank to use previously saved key. Provided key will be securely stored by the backend.
//                             </p>
//                         </div>
//                     )}
//                 </div>

//                 <div className="mt-8 flex justify-end gap-3">
//                     <button
//                         type="button"
//                         onClick={onClose}
//                         className="px-4 py-2 text-sm font-medium rounded-md text-text-light dark:text-text-dark bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
//                         disabled={loading}
//                     >
//                         Cancel
//                     </button>
//                     <button
//                         type="button"
//                         onClick={handleSave}
//                         className="btn-primary-custom flex items-center justify-center gap-2"
//                         disabled={loading}
//                     >
//                         {loading ? (
//                             <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></span>
//                         ) : (
//                             <Save size={18} />
//                         )}
//                         Save Preference
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );
// }
// export default LLMSelectionModal;

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