// // frontend/src/components/auth/AuthModal.jsx
// import React, { useState, useEffect } from 'react';
// import { useAuth } from '../../hooks/useAuth.jsx';
// import { useAppState } from '../../contexts/AppStateContext.jsx';
// import LLMSelection from './LLMSelection.jsx';
// import api from '../../services/api.js'; // For V1, this will use mocked functions
// import toast from 'react-hot-toast';
// import { LogIn, UserPlus, X, Terminal, KeyRound, Link2, User as UserIcon } from 'lucide-react';
// import Button from '../core/Button.jsx';
// import { motion, AnimatePresence } from 'framer-motion'; // Assuming you're using AnimatePresence in App.jsx for this modal

// function AuthModal({ isOpen, onClose }) {
//     const { login, signup, devLogin, isTestingMode, DEV_MODE_ALLOW_DEV_LOGIN } = useAuth(); 
//     const { selectedLLM: globalSelectedLLM, switchLLM: setGlobalLLM } = useAppState();
    
//     const [isLoginView, setIsLoginView] = useState(true);
//     const [username, setUsername] = useState(isTestingMode || DEV_MODE_ALLOW_DEV_LOGIN ? 'DevUser' : '');
//     const [password, setPassword] = useState(isTestingMode || DEV_MODE_ALLOW_DEV_LOGIN ? 'devpass' : '');
//     const [localSelectedLLM, setLocalSelectedLLM] = useState(globalSelectedLLM || 'ollama');
//     const [geminiApiKey, setGeminiApiKey] = useState('');
//     const [ollamaApiUrl, setOllamaApiUrl] = useState('');
    
//     const [error, setError] = useState('');
//     const [loading, setLoading] = useState(false);

//     useEffect(() => {
//         if (isOpen) {
//             setUsername(isTestingMode || DEV_MODE_ALLOW_DEV_LOGIN ? 'DevUser' : '');
//             setPassword(isTestingMode || DEV_MODE_ALLOW_DEV_LOGIN ? 'devpass' : '');
//             setLocalSelectedLLM(globalSelectedLLM || 'ollama');
//             setGeminiApiKey('');
//             setOllamaApiUrl('');
//             setError('');
//         }
//     }, [isOpen, isLoginView, isTestingMode, DEV_MODE_ALLOW_DEV_LOGIN, globalSelectedLLM]);

//     const handleLlmChange = (llm) => setLocalSelectedLLM(llm);

//     const handleSubmit = async (e) => {
//         e.preventDefault();
//         if (!username.trim() || !password.trim()) {
//             setError("Username and password are required.");
//             toast.error("Username and password are required.");
//             return;
//         }
//         setError('');
//         setLoading(true);
//         const toastId = toast.loading(isLoginView ? 'Logging in...' : 'Signing up...');

//         try {
//             let response;
//             const apiPayload = { username, password };

//             if (isLoginView) {
//                 response = await login(apiPayload); // Calls mock login from AuthContext or api.js
//             } else { 
//                 response = await signup(apiPayload); // Calls mock signup
//                 setGlobalLLM(localSelectedLLM); 
                
//                 if (localSelectedLLM === 'gemini' && geminiApiKey.trim()) {
//                     await api.updateUserLLMConfig({ llmProvider: 'gemini', apiKey: geminiApiKey.trim() }); // Mocked
//                     toast.success('Gemini API key preference noted (mocked).');
//                 }
//                 if (localSelectedLLM === 'ollama' && ollamaApiUrl.trim()) {
//                      await api.updateUserLLMConfig({ llmProvider: 'ollama', ollamaUrl: ollamaApiUrl.trim() }); // Mocked
//                     toast.success('Ollama URL preference noted (mocked).');
//                 }
//             }
//             toast.dismiss(toastId);
//             toast.success(isLoginView ? 'Mock Login Successful!' : 'Mock Signup Successful!');
//             onClose(response); 
//         } catch (err) {
//             toast.dismiss(toastId);
//             const errorMessage = err.message || `Failed: ${isLoginView ? 'login' : 'signup'} (mock error)`;
//             setError(errorMessage);
//             toast.error(errorMessage);
//         } finally {
//             setLoading(false);
//         }
//     };

//     const handleDevLogin = () => {
//         if (devLogin) { // devLogin comes from AuthContext
//             const devData = devLogin(); 
//             if (devData) {
//                 toast.success("Dev Quick Login Successful!");
//                 onClose(devData);
//             }
//         } else {
//             toast.error("Dev login not available.");
//         }
//     };

//     if (!isOpen && !isTestingMode) return null; // If not testing mode and not open, render nothing
//     if (isTestingMode && !isOpen && token && user) return null; // If testing mode, already "logged in" and modal not forced open

//     // Define input classes here for consistency
//     const inputWrapperClass = "relative";
//     const inputIconClass = "absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted-light dark:text-text-muted-dark pointer-events-none";
//     const inputFieldClass = "input-field pl-10 py-2.5 text-sm"; // Uses .input-field from index.css

//     return (
//         // No AnimatePresence here, App.jsx handles it for the modal
//         <motion.div
//             key="auth-modal-content" // For AnimatePresence in App.jsx
//             initial={{ opacity: 0, scale: 0.95, y: -20 }}
//             animate={{ opacity: 1, scale: 1, y: 0 }}
//             exit={{ opacity: 0, scale: 0.95, y: 10 }}
//             transition={{ type: "spring", stiffness: 400, damping: 25 }}
//             className="card-base p-6 sm:p-8 w-full max-w-md glass-effect" // Added glass-effect
//             // Removed backdrop div, assuming Modal component in App.jsx handles it
//         >
//             <div className="flex justify-between items-center mb-6">
//                 <h2 className="text-xl sm:text-2xl font-bold text-text-light dark:text-text-dark">
//                     {isLoginView ? 'Welcome Back' : 'Create Your Account'}
//                 </h2>
//                 <IconButton 
//                     icon={X} 
//                     onClick={() => onClose(null)} // Pass null to indicate manual close
//                     variant="ghost" 
//                     size="sm" 
//                     title="Close" 
//                     className="text-text-muted-light dark:text-text-muted-dark hover:text-red-500 dark:hover:text-red-400"
//                 />
//             </div>

//             {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 rounded-md text-sm animate-fadeIn">{error}</div>}

//             <form onSubmit={handleSubmit} className="space-y-5">
//                 <div className={inputWrapperClass}>
//                     <UserIcon className={inputIconClass} />
//                     <input type="text" id="username" className={inputFieldClass} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required disabled={loading}/>
//                 </div>
//                 <div className={inputWrapperClass}>
//                     <KeyRound className={inputIconClass} />
//                     <input type="password" id="password" className={inputFieldClass} placeholder="Password (min. 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength="6" disabled={loading}/>
//                 </div>

//                 {!isLoginView && (
//                     <div className="space-y-4 pt-2 animate-fadeIn">
//                         <LLMSelection selectedLLM={localSelectedLLM} onLlmChange={handleLlmChange} />
//                         {localSelectedLLM === 'gemini' && (
//                             <div className="mt-3 space-y-1">
//                                 <label htmlFor="geminiApiKeyModal" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark">Gemini API Key (Optional)</label>
//                                 <div className={inputWrapperClass}>
//                                     <KeyRound className={inputIconClass} />
//                                     <input type="password" id="geminiApiKeyModal" className={inputFieldClass} placeholder="Enter your Gemini API Key" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} disabled={loading}/>
//                                 </div>
//                             </div>
//                         )}
//                         {localSelectedLLM === 'ollama' && (
//                             <div className="mt-3 space-y-1">
//                                 <label htmlFor="ollamaApiUrlModal" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark">Ollama API URL (Optional)</label>
//                                  <div className={inputWrapperClass}>
//                                     <Link2 className={inputIconClass} />
//                                     <input type="text" id="ollamaApiUrlModal" className={inputFieldClass} placeholder="Default: http://localhost:11434" value={ollamaApiUrl} onChange={(e) => setOllamaApiUrl(e.target.value)} disabled={loading}/>
//                                 </div>
//                             </div>
//                         )}
//                     </div>
//                 )}

//                 <Button type="submit" fullWidth isLoading={loading} leftIcon={isLoginView ? <LogIn size={18}/> : <UserPlus size={18}/>} className="py-2.5 !text-base"> {/* Made button text larger */}
//                     {isLoginView ? 'Login' : 'Sign Up'}
//                 </Button>
//             </form>

//             <p className="mt-6 text-center text-sm">
//                 <button 
//                     onClick={() => { setIsLoginView(!isLoginView); setError(''); }}
//                     className="font-medium text-primary hover:text-primary-dark dark:text-primary-light dark:hover:text-primary-darker transition-colors"
//                     disabled={loading}
//                 >
//                     {isLoginView ? "Don't have an account? Sign Up" : "Already have an account? Login"}
//                 </button>
//             </p>

//             {/* DEV_MODE_ALLOW_DEV_LOGIN is from AuthContext */}
//             {DEV_MODE_ALLOW_DEV_LOGIN && ( 
//                 <div className="mt-4 pt-4 border-t border-border-light dark:border-border-dark">
//                     <Button
//                         type="button" onClick={handleDevLogin} fullWidth 
//                         className="bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700 !text-white dark:!text-gray-900 font-semibold py-2.5 !text-base" // Overriding some default Button styles
//                         leftIcon={<Terminal size={18} />}
//                     >
//                         Dev Quick Login
//                     </Button>
//                 </div>
//             )}
//         </motion.div>
//     );
// }
// export default AuthModal;







// frontend/src/components/auth/AuthModal.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { useAppState } from '../../contexts/AppStateContext.jsx';
import LLMSelection from './LLMSelection.jsx';
import api from '../../services/api.js'; 
import toast from 'react-hot-toast';
import { LogIn, UserPlus, X, Terminal, KeyRound, Link2, User as UserIcon, AlertCircle } from 'lucide-react';
import Button from '../core/Button.jsx';
import IconButton from '../core/IconButton.jsx'; // <<--- ***** ADD THIS IMPORT *****
import { motion } from 'framer-motion';

function AuthModal({ isOpen, onClose }) {
    const { 
        login, signup, devLogin, 
        DEV_MODE_ALLOW_DEV_LOGIN, // Flag from AuthContext
        MOCK_DEV_USERNAME, MOCK_DEV_PASSWORD // Default credentials from AuthContext
    } = useAuth(); 
    const { selectedLLM: globalSelectedLLM, switchLLM: setGlobalLLM } = useAppState();
    
    const [isLoginView, setIsLoginView] = useState(true);
    // Pre-fill if dev mode allows and credentials are provided by AuthContext
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
            let response;
            const apiPayload = { username, password };
            if (isLoginView) {
                response = await login(apiPayload);
            } else { 
                response = await signup(apiPayload);
                setGlobalLLM(localSelectedLLM);
                if (localSelectedLLM === 'gemini' && geminiApiKey.trim()) {
                    await api.updateUserLLMConfig({ llmProvider: 'gemini', apiKey: geminiApiKey.trim() });
                    toast.success('Gemini API key preference noted (mocked).');
                }
                if (localSelectedLLM === 'ollama' && ollamaApiUrl.trim()) {
                     await api.updateUserLLMConfig({ llmProvider: 'ollama', ollamaUrl: ollamaApiUrl.trim() });
                    toast.success('Ollama URL preference noted (mocked).');
                }
            }
            toast.dismiss(toastId);
            toast.success(isLoginView ? 'Login Successful!' : 'Signup Successful!');
            onClose(response); 
        } catch (err) {
            toast.dismiss(toastId);
            const errorMessage = err.response?.data?.message || err.message || `Failed: ${isLoginView ? 'login' : 'signup'}`;
            setError(errorMessage);
            toast.error(errorMessage);
        } finally { setLoading(false); }
    };

    const handleDevLogin = async () => {
        if (devLogin) {
            setDevLoginLoading(true); setError('');
            const toastId = toast.loading("Attempting Dev Quick Login...");
            try {
                const devData = await devLogin(); 
                if (devData && devData.token) {
                    toast.dismiss(toastId);
                    toast.success("Dev Quick Login Successful!");
                    onClose(devData);
                } else {
                    throw new Error("Dev login conditions not met or mock API failed.");
                }
            } catch(err) {
                toast.dismiss(toastId);
                const errorMessage = err.message || "Dev Quick Login encountered an error.";
                setError(errorMessage);
                toast.error(errorMessage);
            } finally {
                setDevLoginLoading(false);
            }
        } else {
            toast.error("Dev login feature not available in current AuthContext setup.");
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
                    {/* This is where IconButton is used */}
                    <IconButton 
                        icon={X} 
                        onClick={() => onClose(null)} 
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

                {DEV_MODE_ALLOW_DEV_LOGIN && (
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