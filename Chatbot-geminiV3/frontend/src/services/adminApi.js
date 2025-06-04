// frontend/src/services/adminApi.js
import axios from 'axios';

// Get base URL for admin document endpoints
const ADMIN_DOCS_API_BASE_URL = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'}/admin/documents`;

// Get fixed admin credentials from .env (prefixed with VITE_ for frontend access)
const ADMIN_USERNAME_FRONTEND = import.meta.env.VITE_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_FRONTEND = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';

const adminApiClient = axios.create({
    baseURL: ADMIN_DOCS_API_BASE_URL,
});

// Helper function to generate the Basic Authentication header for the fixed admin
export const getFixedAdminAuthHeaders = () => {
    if (!ADMIN_USERNAME_FRONTEND || !ADMIN_PASSWORD_FRONTEND) {
        console.error("Admin credentials not found in VITE_ADMIN_USERNAME or VITE_ADMIN_PASSWORD .env variables for frontend.");
        // Fallback or throw error - for now, return empty, API call will likely fail 401
        return {}; 
    }
    const basicAuthToken = btoa(`${ADMIN_USERNAME_FRONTEND}:${ADMIN_PASSWORD_FRONTEND}`);
    return { 'Authorization': `Basic ${basicAuthToken}` };
};

// Generic function to make an authenticated admin API request
const makeAdminApiRequest = async (method, endpoint, data = null, authHeaders = {}) => {
    // `authHeaders` here is expected to be the output of `getFixedAdminAuthHeaders()`
    if (!authHeaders.Authorization) {
        // This check is important if getFixedAdminAuthHeaders might return empty due to missing .env vars
        const errorMsg = "Admin authentication headers are missing. Cannot make admin API request.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    try {
        const config = {
            method,
            url: endpoint, // endpoint is relative to ADMIN_DOCS_API_BASE_URL
            headers: {
                ...authHeaders, // Contains 'Authorization: Basic ...'
                'Content-Type': data instanceof FormData ? 'multipart/form-data' : 'application/json',
            },
        };
        if (data) {
            config.data = data;
        }
        const response = await adminApiClient(config);
        return response.data;
    } catch (error) {
        // Construct a more informative error message
        let errorMessage = 'Admin API request failed.';
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            errorMessage = error.response.data?.message || error.response.statusText || `Server error: ${error.response.status}`;
            console.error(`Admin API Error (${method.toUpperCase()} ${ADMIN_DOCS_API_BASE_URL}${endpoint}): Status ${error.response.status}`, error.response.data);
        } else if (error.request) {
            // The request was made but no response was received
            errorMessage = 'No response from admin API server. Check network or server status.';
            console.error(`Admin API Network Error (${method.toUpperCase()} ${ADMIN_DOCS_API_BASE_URL}${endpoint}):`, error.request);
        } else {
            // Something happened in setting up the request that triggered an Error
            errorMessage = error.message || 'Error setting up admin API request.';
            console.error(`Admin API Setup Error (${method.toUpperCase()} ${ADMIN_DOCS_API_BASE_URL}${endpoint}):`, error.message);
        }
        throw new Error(errorMessage); // Throw a new error with the processed message
    }
};

// Specific API functions
export const uploadAdminDocument = async (formData, adminAuthHeaders) => {
    // Backend expects: { message, filename, originalname } on 202 Accepted
    return makeAdminApiRequest('post', '/upload', formData, adminAuthHeaders);
};

export const getAdminDocuments = async (adminAuthHeaders) => {
    // Backend expects: { documents: [{ originalName, serverFilename, uploadedAt, ... }] }
    return makeAdminApiRequest('get', '/', null, adminAuthHeaders);
};

export const deleteAdminDocument = async (serverFilename, adminAuthHeaders) => {
    // Backend expects: { message }
    return makeAdminApiRequest('delete', `/${serverFilename}`, null, adminAuthHeaders);
};

export const getAdminDocumentAnalysis = async (serverFilename, adminAuthHeaders) => {
    // Backend expects: { originalName, analysis: {faq, topics, mindmap}, analysisUpdatedAt }
    return makeAdminApiRequest('get', `/${serverFilename}/analysis`, null, adminAuthHeaders);
};