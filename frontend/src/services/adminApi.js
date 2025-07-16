// frontend/src/services/adminApi.js
import axios from 'axios';

const ADMIN_API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'}/admin`;

const ADMIN_USERNAME_FRONTEND = import.meta.env.VITE_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_FRONTEND = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

const adminApiClient = axios.create({
    baseURL: ADMIN_API_BASE_URL,
});

export const getFixedAdminAuthHeaders = () => {
    if (!ADMIN_USERNAME_FRONTEND || !ADMIN_PASSWORD_FRONTEND) {
        console.error("Admin credentials not found in VITE_ADMIN_USERNAME or VITE_ADMIN_PASSWORD .env variables for frontend.");
        return {};
    }
    const basicAuthToken = btoa(`${ADMIN_USERNAME_FRONTEND}:${ADMIN_PASSWORD_FRONTEND}`);
    return { 'Authorization': `Basic ${basicAuthToken}` };
};

const makeAdminApiRequest = async (method, endpoint, data = null, authHeaders = {}) => {
    if (!authHeaders.Authorization) {
        const errorMsg = "Admin authentication headers are missing. Cannot make admin API request.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    try {
        const config = {
            method,
            url: endpoint,
            headers: {
                ...authHeaders,
                'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
            },
        };
        if (data) {
            config.data = data;
        }
        const response = await adminApiClient(config);
        return response.data;
    } catch (error) {
        let errorMessage = 'Admin API request failed.';
        if (error.response) {
            errorMessage = error.response.data?.message || error.response.statusText || `Server error: ${error.response.status}`;
            console.error(`Admin API Error (${method.toUpperCase()} ${ADMIN_API_BASE_URL}${endpoint}): Status ${error.response.status}`, error.response.data);
        } else if (error.request) {
            errorMessage = 'No response from admin API server. Check network or server status.';
            console.error(`Admin API Network Error (${method.toUpperCase()} ${ADMIN_API_BASE_URL}${endpoint}):`, error.request);
        } else {
            errorMessage = error.message || 'Error setting up admin API request.';
            console.error(`Admin API Setup Error (${method.toUpperCase()} ${ADMIN_API_BASE_URL}${endpoint}):`, error.message);
        }
        throw new Error(errorMessage);
    }
};

// Document-related admin functions
export const uploadAdminDocument = (formData, adminAuthHeaders) => makeAdminApiRequest('post', '/documents/upload', formData, adminAuthHeaders);
export const getAdminDocuments = (adminAuthHeaders) => makeAdminApiRequest('get', '/documents', null, adminAuthHeaders);
export const deleteAdminDocument = (serverFilename, adminAuthHeaders) => makeAdminApiRequest('delete', `/documents/${serverFilename}`, null, adminAuthHeaders);
export const getAdminDocumentAnalysis = (serverFilename, adminAuthHeaders) => makeAdminApiRequest('get', `/documents/${serverFilename}/analysis`, null, adminAuthHeaders);
export const getAdminDocumentAnalysisByOriginalName = (originalName, adminAuthHeaders) => makeAdminApiRequest('get', `/documents/by-original-name/${encodeURIComponent(originalName)}/analysis`, null, adminAuthHeaders);

// API Key request functions
export const getApiKeyRequests = (adminAuthHeaders) => makeAdminApiRequest('get', '/key-requests', null, adminAuthHeaders);
export const approveApiKeyRequest = (userId, adminAuthHeaders) => makeAdminApiRequest('post', '/key-requests/approve', { userId }, adminAuthHeaders);
export const rejectApiKeyRequest = (userId, adminAuthHeaders) => makeAdminApiRequest('post', '/key-requests/reject', { userId }, adminAuthHeaders);

// --- NEW FUNCTION ---
export const getUsersAndChats = (adminAuthHeaders) => makeAdminApiRequest('get', '/users-with-chats', null, adminAuthHeaders);