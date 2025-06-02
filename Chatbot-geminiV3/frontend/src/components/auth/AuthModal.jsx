// frontend/src/components/auth/AuthModal.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useAppState } from '../../contexts/AppStateContext.jsx';
import LLMSelection from './LLMSelection.jsx';
import api from '../../services/api.js'; 
import toast from 'react-hot-toast';
import { LogIn, UserPlus, X, Terminal, KeyRound, Link2, User as UserIcon, AlertCircle } from 'lucide-react';
import Button from '../core/Button.jsx';
import IconButton from '../core/IconButton.jsx';
import { motion } from 'framer-motion';

function AuthModal({ isOpen, onClose }) { // onClose will be called with authData from AuthContext
    const { 
        login, signup, devLogin, 
        DEV_MODE_ALLOW_DEV_LOGIN, 
        MOCK_DEV_USERNAME, MOCK_DEV_PASSWORD
    } = useAuth(); 
    const { selectedLLM: globalSelectedLLM, switchLLM: setGlobalLLM } = useAppState();
    
    const [isLoginView, setIsLoginView] = useState(true);
    const [username, setUsername] = useState(DEV_MODE_ALLOW_DEV_LOGIN ? (MOCK_DEV_USERNAME || '') : '');
    const [password, setPassword] = useState(DEV_MODE_ALLOW_DEV_LOGIN ? (MOCK_DEV_PASSWORD || '') : '');
    const [localSelectedLLM, setLocalSelectedLLM] = useState(globalSelectedLLM || 'ollama');
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [ollamaApiUrl, setOllamaApiUrl] = useState('');
    
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [devLoginLoading, setDevLoginLoading] = useState(false); 

    useEffect(() => {
        if (isOpen) {
            setError(''); 
            if (isLoginView && DEV_MODE_ALLOW_DEV_LOGIN) {
                setUsername(MOCK_DEV_USERNAME || '');
                setPassword(MOCK_DEV_PASSWORD || '');
            } else if (!isLoginView) { 
                setUsername('');
                setPassword('');
            }
            setLocalSelectedLLM(globalSelectedLLM || 'ollama');
            setGeminiApiKey('');
            setOllamaApiUrl('');
        }
    }, [isOpen, isLoginView, DEV_MODE_ALLOW_DEV_LOGIN, MOCK_DEV_USERNAME, MOCK_DEV_PASSWORD, globalSelectedLLM]);

    const handleLlmChange = (llm) => setLocalSelectedLLM(llm);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            setError("Username and password are required.");
            toast.error("Username and password are required.");
            return;
        }

        setError(''); setLoading(true);
        const toastId = toast.loading(isLoginView ? 'Logging in...' : 'Signing up...');
        
        try {
            let authDataResponse; // This will contain { token, _id, username, sessionId, message }
            const apiPayload = { username, password };
            if (isLoginView) {
                authDataResponse = await login(apiPayload); // From AuthContext
            } else { 
                authDataResponse = await signup(apiPayload); // From AuthContext
                
                setGlobalLLM(localSelectedLLM); // Update AppStateContext
                
                // Attempt to save LLM config (api.js will handle mock/real)
                if (localSelectedLLM === 'gemini' && geminiApiKey.trim()) {
                    try {
                        await api.updateUserLLMConfig({ llmProvider: 'gemini', apiKey: geminiApiKey.trim() });
                        // No separate toast here, AuthContext's response is primary
                    } catch (configErr) { toast.error(`Note: Could not save Gemini config to backend: ${configErr.message}`);}
                }
                if (localSelectedLLM === 'ollama' && ollamaApiUrl.trim()) {
                    try {
                         await api.updateUserLLMConfig({ llmProvider: 'ollama', ollamaUrl: ollamaApiUrl.trim() });
                    } catch (configErr) { toast.error(`Note: Could not save Ollama config to backend: ${configErr.message}`);}
                }
            }
            toast.dismiss(toastId);
            toast.success(authDataResponse.message || (isLoginView ? 'Login Successful!' : 'Signup Successful!'));
            onClose(authDataResponse); // Pass the full authData from AuthContext to App.jsx
        } catch (err) {
            toast.dismiss(toastId);
            const errorMessage = err.response?.data?.message || err.message || `Failed: ${isLoginView ? 'login' : 'signup'}`;
            setError(errorMessage);
            toast.error(errorMessage);
        } finally { setLoading(false); }
    };

    const handleDevLogin = async () => {
        if (!devLogin) {
            toast.error("Dev Quick Login is not available in current setup.");
            return;
        }
        setDevLoginLoading(true); setError('');
        const toastId = toast.loading("Attempting Dev Quick Login...");
        try {
            const devAuthData = await devLogin(); // From AuthContext
            toast.dismiss(toastId);
            toast.success(devAuthData.message || "Dev Quick Login Successful!");
            onClose(devAuthData); // Pass full authData
        } catch(err) {
            toast.dismiss(toastId);
            const errorMessage = err.response?.data?.message || err.message || "Dev Quick Login encountered an error.";
            setError(errorMessage);
            toast.error(errorMessage);
        } finally {
            setDevLoginLoading(false);
        }
    };

    if (!isOpen) return null;

    const inputWrapperClass = "relative";
    const inputIconClass = "absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted-light dark:text-text-muted-dark pointer-events-none";
    const inputFieldStyledClass = "input-field pl-10 py-2.5 text-sm";

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            <motion.div 
                key="auth-modal-content"
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="card-base p-6 sm:p-8 w-full max-w-md glass-effect"
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl sm:text-2xl font-bold text-text-light dark:text-text-dark">
                        {isLoginView ? 'Welcome Back' : 'Create Your Account'}
                    </h2>
                    <IconButton 
                        icon={X} 
                        onClick={() => onClose(null)} // Pass null if modal closed manually without auth
                        variant="ghost" 
                        size="sm" 
                        title="Close" 
                        className="text-text-muted-light dark:text-text-muted-dark hover:text-red-500 dark:hover:text-red-400"
                    />
                </div>

                {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 rounded-md text-sm animate-fadeIn flex items-center gap-2"><AlertCircle size={16}/>{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className={inputWrapperClass}>
                        <UserIcon className={inputIconClass} />
                        <input type="text" id="username" className={inputFieldStyledClass} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={loading || devLoginLoading}/>
                    </div>
                    <div className={inputWrapperClass}>
                        <KeyRound className={inputIconClass} />
                        <input type="password" id="password" className={inputFieldStyledClass} placeholder="Password (min. 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="6" disabled={loading || devLoginLoading}/>
                    </div>

                    {!isLoginView && (
                        <div className="space-y-4 pt-2 animate-fadeIn">
                            <LLMSelection selectedLLM={localSelectedLLM} onLlmChange={handleLlmChange} disabled={loading || devLoginLoading}/>
                            {localSelectedLLM === 'gemini' && (
                                <div className="mt-3 space-y-1">
                                    <label htmlFor="geminiApiKeyModal" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark">Gemini API Key (Optional)</label>
                                    <div className={inputWrapperClass}>
                                        <KeyRound className={inputIconClass} />
                                        <input type="password" id="geminiApiKeyModal" className={inputFieldStyledClass} placeholder="Enter your Gemini API Key" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} disabled={loading || devLoginLoading}/>
                                    </div>
                                </div>
                            )}
                            {localSelectedLLM === 'ollama' && (
                                <div className="mt-3 space-y-1">
                                    <label htmlFor="ollamaApiUrlModal" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark">Ollama API URL (Optional)</label>
                                     <div className={inputWrapperClass}>
                                        <Link2 className={inputIconClass} />
                                        <input type="text" id="ollamaApiUrlModal" className={inputFieldStyledClass} placeholder="Default: http://localhost:11434" value={ollamaApiUrl} onChange={(e) => setOllamaApiUrl(e.target.value)} disabled={loading || devLoginLoading}/>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <Button type="submit" fullWidth isLoading={loading} disabled={devLoginLoading} leftIcon={isLoginView ? <LogIn size={18}/> : <UserPlus size={18}/>} className="py-2.5 !text-base">
                        {isLoginView ? 'Login' : 'Sign Up'}
                    </Button>
                </form>

                <p className="mt-6 text-center text-sm">
                    <button 
                        onClick={() => { setIsLoginView(!isLoginView); setError(''); }}
                        className="font-medium text-primary hover:text-primary-dark dark:text-primary-light dark:hover:text-primary-darker transition-colors"
                        disabled={loading || devLoginLoading}
                    >
                        {isLoginView ? "Don't have an account? Sign Up" : "Already have an account? Login"}
                    </button>
                </p>

                {DEV_MODE_ALLOW_DEV_LOGIN && devLogin && (
                    <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark">
                        <Button
                            type="button" onClick={handleDevLogin} fullWidth 
                            className="bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 !text-white dark:!text-gray-900 font-semibold py-2.5 !text-base"
                            leftIcon={<Terminal size={18} />}
                            isLoading={devLoginLoading} 
                            disabled={loading} 
                        >
                            Dev Quick Login
                        </Button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
export default AuthModal;