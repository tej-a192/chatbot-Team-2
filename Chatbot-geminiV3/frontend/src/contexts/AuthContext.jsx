// frontend/src/contexts/AuthContext.jsx
import React, { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api.js'; 
import toast from 'react-hot-toast';
// No need for jwt-decode here if backend sends user details or /me provides them.

export const AuthContext = createContext(null);

// --- DEVELOPMENT FLAGS ---
export const DEV_MODE_ALLOW_DEV_LOGIN = false; // <-- SET TO false
const MOCK_DEV_USERNAME = 'DevUser'; 
const MOCK_DEV_PASSWORD = 'devpassword';   
// --- END DEVELOPMENT FLAGS ---

export const AuthProvider = ({ children }) => {
    const [token, setTokenState] = useState(localStorage.getItem('authToken'));
    const [user, setUserState] = useState(null);
    const [loading, setLoading] = useState(true);

    const setToken = (newToken) => {
        if (newToken) {
            localStorage.setItem('authToken', newToken);
        } else {
            localStorage.removeItem('authToken');
        }
        setTokenState(newToken);
    };

    const setUser = (newUser) => {
        setUserState(newUser);
    };
    
    const processAuthData = useCallback((authApiResponse) => {
        // Expects authApiResponse to be: { token, _id, username, sessionId?, message? }
        if (authApiResponse && authApiResponse.token && authApiResponse._id && authApiResponse.username) {
            setToken(authApiResponse.token);
            setUser({ id: authApiResponse._id, username: authApiResponse.username });
            console.log("AuthContext: User and Token set.", { username: authApiResponse.username });
            // Session ID from authApiResponse (like authApiResponse.sessionId)
            // will be passed to App.jsx through the onClose callback of AuthModal
            return authApiResponse; 
        } else {
            console.error("AuthContext: processAuthData received incomplete data from API", authApiResponse);
            // Clear any partial auth state
            setToken(null);
            setUser(null);
            throw new Error("Authentication response from server was incomplete.");
        }
    }, []); // No dependencies needed as setToken and setUser are stable

    useEffect(() => {
        const verifyTokenAndLoadUser = async () => {
            const storedToken = localStorage.getItem('authToken');
            if (storedToken) {
                setTokenState(storedToken); // Set token for api.getMe() to use Authorization header
                try {
                    console.log("AuthContext: Found stored token. Verifying with /me...");
                    const userDataFromMe = await api.getMe(); // api.js will include the token
                    if (userDataFromMe && userDataFromMe._id && userDataFromMe.username) {
                        setUser({ id: userDataFromMe._id, username: userDataFromMe.username });
                        // Token is already set from localStorage and has been confirmed valid by /me
                        console.log("AuthContext: Token verified, user loaded via /me.", userDataFromMe);
                    } else {
                        console.warn("AuthContext: /me endpoint did not return valid user data.", userDataFromMe);
                        setToken(null); // Clear invalid token from state and localStorage
                        setUser(null);
                    }
                } catch (error) {
                    console.warn("AuthContext: Auto-login via /me failed. Token might be invalid or expired.", error.message);
                    setToken(null); // Clear invalid token
                    setUser(null);
                }
            } else {
                console.log("AuthContext: No stored token found.");
            }
            setLoading(false);
        };
        verifyTokenAndLoadUser();
    }, []);

    const login = async (credentials) => {
        setLoading(true);
        try {
            const data = await api.login(credentials); // data = { token, _id, username, sessionId, message }
            return processAuthData(data);
        } catch (error) {
            setToken(null); 
            setUser(null);
            console.error("AuthContext login error:", error.response?.data?.message || error.message);
            throw error; 
        } finally {
            setLoading(false);
        }
    };
    
    const signup = async (signupData) => {
        setLoading(true);
        try {
            const data = await api.signup(signupData); // data = { token, _id, username, sessionId, message }
            return processAuthData(data);
        } catch (error) {
            setToken(null);
            setUser(null);
            console.error("AuthContext signup error:", error.response?.data?.message || error.message);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        console.log("AuthContext: Logging out user.");
        setToken(null); 
        setUser(null);
        // Other contexts (like AppStateContext for sessionId) should react to token/user becoming null.
        toast.success("You have been logged out.");
    };

    // Dev login will attempt to use MOCK_DEV_USERNAME/PASSWORD against the REAL backend if DEV_MODE_MOCK_API in api.js is false.
    // This will likely fail unless that user exists on the backend.
    const devLogin = async () => {
        if (!DEV_MODE_ALLOW_DEV_LOGIN) {
            const msg = "Dev Quick Login is disabled in AuthContext.";
            toast.error(msg);
            return Promise.reject(new Error(msg));
        }
        console.warn("AuthContext: devLogin initiated. This attempts to log in with MOCK credentials against the configured API endpoint.");
        setLoading(true);
        try {
            const data = await api.login({ username: MOCK_DEV_USERNAME, password: MOCK_DEV_PASSWORD });
            return processAuthData(data);
        } catch (error) {
            setToken(null);
            setUser(null);
            const errorMsg = error.response?.data?.message || error.message || "Dev login attempt failed.";
            console.error("AuthContext: Dev Quick Login via API failed:", errorMsg);
            toast.error(`Dev Login Error: ${errorMsg}`);
            throw error; 
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ 
            token, 
            user, 
            loading, 
            login, 
            signup, 
            logout, 
            devLogin: DEV_MODE_ALLOW_DEV_LOGIN ? devLogin : undefined,
            setUser, // Allow App.jsx or other components to potentially set user details if needed
            // setToken, // Exposing setToken directly is usually not needed by consumers
            DEV_MODE_ALLOW_DEV_LOGIN,
            MOCK_DEV_USERNAME,
            MOCK_DEV_PASSWORD
        }}>
            {children}
        </AuthContext.Provider>
    );
};