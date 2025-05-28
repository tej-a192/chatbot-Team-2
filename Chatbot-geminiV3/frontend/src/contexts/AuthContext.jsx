// frontend/src/contexts/AuthContext.jsx
import React, { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api.js'; 
import { jwtDecode } from 'jwt-decode';
import toast from 'react-hot-toast'; // IMPORTED

export const AuthContext = createContext(null);

export const DEV_MODE_ALLOW_DEV_LOGIN = true; 
const MOCK_DEV_USERNAME = 'DevUser'; 
const MOCK_DEV_PASSWORD = 'devpassword';   

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('authToken'));
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const parseToken = useCallback((tok) => {
        if (!tok) return null;
        try {
            const decoded = jwtDecode(tok); 
            return { id: decoded.id || decoded.sub || 'mock-user-id', username: decoded.username || 'MockedUser' };
        } catch (e) {
            // console.warn("AuthContext: Failed to decode token (likely a simple mock token):", e.message);
            if (tok && (tok.startsWith('mock-token-') || tok.startsWith('fake-dev-token-'))) { 
                 const usernameFromMockToken = tok.split('-')[2] || MOCK_DEV_USERNAME;
                 return {id: `mock-id-${usernameFromMockToken}`, username: usernameFromMockToken};
            }
            localStorage.removeItem('authToken'); 
            return null;
        }
    }, []);

    // Example adjustment in AuthContext.jsx's useEffect
    useEffect(() => {
        const attemptAutoLogin = async () => {
            setLoading(true);
            const storedToken = localStorage.getItem('authToken');
            if (storedToken) {
                try {
                    // If DEV_MODE_MOCK_API is true, api.getMe() will use its mock.
                    // If false, it hits the real /auth/me endpoint with the token.
                    const userData = await api.getMe(); 
                    setUser({ id: userData._id, username: userData.username }); // Assuming _id is returned as id
                    setToken(storedToken);
                    console.log("AuthContext: Auto-login successful via /me endpoint.", userData);
                } catch (error) {
                    console.warn("AuthContext: Auto-login failed (token invalid or /me error). Clearing token.", error.response?.data?.message || error.message);
                    localStorage.removeItem('authToken');
                    setToken(null);
                    setUser(null);
                }
            }
            setLoading(false);
        };
        attemptAutoLogin();
    }, []); // No dependencies, runs once on mount

    const login = async (credentials) => {
        setLoading(true); // Good practice to set loading true for the API call
        try {
            const data = await api.login(credentials); // This now hits the real backend if DEV_MODE_MOCK_API is false
            localStorage.setItem('authToken', data.token);
            // Use user details directly from response if available and preferred
            setUser({ id: data._id, username: data.username }); 
            setToken(data.token);
            setLoading(false);
            return data; // Return the full response which includes sessionId etc.
        } catch (error) {
            setLoading(false);
            throw error; // Re-throw for AuthModal to handle
        }
    };
    
    const signup = async (signupData) => {
        setLoading(true);
        try {
            const data = await api.signup(signupData); 
            if (data.token) { 
                localStorage.setItem('authToken', data.token);
                setUser({ id: data._id, username: data.username });
                setToken(data.token);
            }
            setLoading(false);
            return data;
        } catch (error) {
            setLoading(false);
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('authToken');
        setUser(null);
        setToken(null);
        toast.success("Logged out.");
    };

    const devLogin = async () => { // Ensure it's async
        if (DEV_MODE_ALLOW_DEV_LOGIN) {
            console.log("AuthContext: devLogin initiated.");
            try {
                // This calls the mocked api.login from services/api.js
                const data = await api.login({ username: MOCK_DEV_USERNAME, password: MOCK_DEV_PASSWORD });
                if (data && data.token) { // Check if data and token are returned
                    localStorage.setItem('authToken', data.token);
                    const decodedUser = parseToken(data.token);
                    setUser(decodedUser);
                    setToken(data.token);
                    console.log("AuthContext: Dev Quick Login successful. User:", decodedUser);
                    return data; // Crucially, return the data object
                } else {
                    console.error("AuthContext: Mock api.login for devLogin did not return expected data (token).");
                    throw new Error("Mock API login failed to provide token.");
                }
            } catch (error) {
                console.error("AuthContext: Dev Quick Login via mock api.login failed:", error);
                toast.error(`Dev Login Error: ${error.message}`); // More specific error
                // Do not rethrow here if AuthModal will handle based on null return
                return null; // Indicate failure
            }
        }
        console.warn("devLogin called but DEV_MODE_ALLOW_DEV_LOGIN is false.");
        return null; // Return null if not allowed or if it fails
    };

    return (
        <AuthContext.Provider value={{ 
            token, user, loading, 
            login, signup, logout, 
            devLogin: DEV_MODE_ALLOW_DEV_LOGIN ? devLogin : undefined, 
            setUser, setToken, 
            DEV_MODE_ALLOW_DEV_LOGIN,
            MOCK_DEV_USERNAME, MOCK_DEV_PASSWORD
        }}>
            {children}
        </AuthContext.Provider>
    );
};