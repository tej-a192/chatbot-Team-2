// frontend/src/components/admin/AdminDashboardPage.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../../contexts/AppStateContext.jsx';
import * as adminApi from '../../services/adminApi.js';
import Button from '../core/Button.jsx';
import IconButton from '../core/IconButton.jsx';
import Modal from '../core/Modal.jsx';
import ApiKeyRequestManager from './ApiKeyRequestManager.jsx';
import UserChatManager from './UserChatManager.jsx'; // <<< NEW IMPORT
import { UploadCloud, FileText, Trash2, Eye, LogOut, Loader2, AlertTriangle, CheckCircle, RefreshCw, Shield, Users } from 'lucide-react'; // Added Shield, Users
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Helper functions (same as before)
const localParseAnalysisOutput = (rawOutput) => { /* ... no changes ... */ 
    if (!rawOutput || typeof rawOutput !== 'string') return { content: '' };
    const thinkingMatch = rawOutput.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    let mainContent = rawOutput;
    if (thinkingMatch && thinkingMatch[1]) {
        mainContent = rawOutput.replace(/<thinking>[\s\S]*?<\/thinking>\s*/i, '').trim();
    }
    return { content: mainContent };
};
const createMarkup = (markdownText) => { /* ... no changes ... */ 
    if (!markdownText) return { __html: '' };
    const html = marked.parse(markdownText);
    const cleanHtml = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    return { __html: cleanHtml };
};


// AdminDocumentUpload Component (no changes)
function AdminDocumentUpload({ onUploadSuccess }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);
    const handleFileChange = (e) => { if (isUploading) return; const file = e.target.files && e.target.files[0]; if (file) setSelectedFile(file); else setSelectedFile(null); };
    const handleUpload = async () => {
        if (!selectedFile) { toast.error("Please select a file to upload."); return; }
        setIsUploading(true);
        const toastId = toast.loading(`Uploading "${selectedFile.name}"...`);
        const formData = new FormData();
        formData.append('file', selectedFile);
        try {
            const authHeaders = adminApi.getFixedAdminAuthHeaders();
            const response = await adminApi.uploadAdminDocument(formData, authHeaders);
            toast.success(response.message || `Admin document "${selectedFile.name}" uploaded.`, { id: toastId });
            onUploadSuccess();
            setSelectedFile(null);
            if (fileInputRef.current) fileInputRef.current.value = null;
        } catch (error) {
            toast.error(error.message || `Failed to upload "${selectedFile.name}".`, { id: toastId });
        } finally {
            setIsUploading(false);
        }
    };
    return (
        <div className="card-base p-4 mb-6">
            <h2 className="text-lg font-semibold mb-3 text-text-light dark:text-text-dark">Upload New Admin Document</h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="input-field flex-grow text-sm p-2.5 min-h-[44px]" accept=".pdf,.docx,.txt,.md" disabled={isUploading} />
                <Button onClick={handleUpload} isLoading={isUploading} disabled={!selectedFile || isUploading} leftIcon={<UploadCloud size={16} />} size="md" className="w-full sm:w-auto !py-2.5">Upload</Button>
            </div>
            {selectedFile && !isUploading && <p className="text-xs mt-2 text-text-muted-light dark:text-text-muted-dark">Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</p>}
        </div>
    );
}

// Main AdminDashboardPage Component
function AdminDashboardPage() {
    const { setIsAdminSessionActive } = useAppState();
    const navigate = useNavigate();

    const [documents, setDocuments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [currentDocForModal, setCurrentDocForModal] = useState(null);
    const [analysisContent, setAnalysisContent] = useState(null);
    const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
    
    const [keyRequests, setKeyRequests] = useState([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(true);
    
    const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
    
    // --- NEW STATE FOR USER CHATS ---
    const [usersWithChats, setUsersWithChats] = useState([]);
    const [isLoadingUserChats, setIsLoadingUserChats] = useState(true);
    const [isUserChatsModalOpen, setIsUserChatsModalOpen] = useState(false);

    const adminLogoutHandler = () => {
        setIsAdminSessionActive(false);
        toast.success("Admin logged out.");
        navigate('/');
    };

    const fetchAdminData = useCallback(async (showLoadingToast = false) => {
        let toastId;
        if (showLoadingToast) {
            toastId = toast.loading("Refreshing admin data...");
        } else {
            setIsLoading(true);
            setIsLoadingRequests(true);
            setIsLoadingUserChats(true);
        }
        setError('');
        try {
            const authHeaders = adminApi.getFixedAdminAuthHeaders();
            const [docsResponse, requestsResponse, usersResponse] = await Promise.all([
                adminApi.getAdminDocuments(authHeaders),
                adminApi.getApiKeyRequests(authHeaders),
                adminApi.getUsersAndChats(authHeaders)
            ]);

            setDocuments(Array.isArray(docsResponse.documents) ? docsResponse.documents : []);
            setKeyRequests(Array.isArray(requestsResponse) ? requestsResponse : []);
            setUsersWithChats(Array.isArray(usersResponse) ? usersResponse : []);

            if (showLoadingToast) toast.success("Admin data refreshed.", { id: toastId });
        } catch (err) {
            const errorMessage = err.message || "Failed to fetch admin data.";
            setError(errorMessage);
            if (showLoadingToast) toast.error(errorMessage, { id: toastId });
            else toast.error(errorMessage);
        } finally {
            if (!showLoadingToast) {
                setIsLoading(false);
                setIsLoadingRequests(false);
                setIsLoadingUserChats(false);
            }
        }
    }, []);

    useEffect(() => { fetchAdminData(); }, [fetchAdminData]);
    const handleDeleteDocument = async (serverFilename, originalName) => { /* ...no changes... */ 
        if (!window.confirm(`Are you sure you want to delete admin document "${originalName}"?`)) return;
        const toastId = toast.loading(`Deleting "${originalName}"...`);
        try {
            const authHeaders = adminApi.getFixedAdminAuthHeaders();
            await adminApi.deleteAdminDocument(serverFilename, authHeaders);
            toast.success(`Document "${originalName}" deleted.`, { id: toastId });
            fetchAdminData();
            if (isAnalysisModalOpen && currentDocForModal?.serverFilename === serverFilename) {
                setIsAnalysisModalOpen(false);
            }
        } catch (err) {
            toast.error(err.message || `Failed to delete "${originalName}".`, { id: toastId });
        }
    };
    const handleViewAnalysis = async (doc) => { /* ...no changes... */ 
        setCurrentDocForModal(doc);
        setAnalysisContent(null);
        setIsAnalysisModalOpen(true);
        setIsLoadingAnalysis(true);
        try {
            const authHeaders = adminApi.getFixedAdminAuthHeaders();
            const response = await adminApi.getAdminDocumentAnalysis(doc.serverFilename, authHeaders);
            setAnalysisContent(response.analysis);
        } catch (err) {
            toast.error(`Failed to load analysis: ${err.message}`);
            setAnalysisContent({ error: `Failed to load analysis: ${err.message}` });
        } finally {
            setIsLoadingAnalysis(false);
        }
    };
    const renderAnalysisModalContent = () => { /* ...no changes... */ 
        if (isLoadingAnalysis) {
            return (
                <div className="flex justify-center items-center h-48">
                    <Loader2 size={32} className="animate-spin text-primary" />
                    <p className="ml-2 text-text-muted-light dark:text-text-muted-dark">Loading analysis...</p>
                </div>
            );
        }
        if (!analysisContent || analysisContent.error) {
            return <p className="p-4 text-center text-red-500 dark:text-red-400">{analysisContent?.error || "No analysis content available or an error occurred."}</p>;
        }
        const hasContent = analysisContent.faq?.trim() || analysisContent.topics?.trim() || analysisContent.mindmap?.trim();
        if (!hasContent) {
            return <p className="p-4 text-center text-text-muted-light dark:text-text-muted-dark">Analysis has not been generated for this document, or all analysis fields are empty.</p>;
        }
        return (
            <div className="prose prose-sm dark:prose-invert max-w-none text-text-light dark:text-text-dark space-y-6 p-1 custom-scrollbar">
                {analysisContent.faq?.trim() && ( <div><h3 className="text-base font-semibold border-b border-border-light dark:border-border-dark pb-1 mb-2">Frequently Asked Questions</h3><div dangerouslySetInnerHTML={createMarkup(localParseAnalysisOutput(analysisContent.faq).content)} /></div>)}
                {analysisContent.topics?.trim() && ( <div><h3 className="text-base font-semibold border-b border-border-light dark:border-border-dark pb-1 mb-2">Key Topics</h3><div dangerouslySetInnerHTML={createMarkup(localParseAnalysisOutput(analysisContent.topics).content)} /></div>)}
                {analysisContent.mindmap?.trim() && (<div><h3 className="text-base font-semibold border-b border-border-light dark:border-border-dark pb-1 mb-2">Mind Map (Mermaid Code)</h3><pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded-md text-xs whitespace-pre-wrap overflow-x-auto custom-scrollbar"><code>{localParseAnalysisOutput(analysisContent.mindmap).content}</code></pre></div>)}
            </div>
        );
    };
    
    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark p-4 sm:p-6">
            <header className="flex items-center justify-between mb-6 pb-3 border-b border-border-light dark:border-border-dark">
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <div className="flex items-center gap-2">
                    <IconButton icon={RefreshCw} onClick={() => fetchAdminData(true)} title="Refresh Admin Data" variant="ghost" size="md" className="text-text-muted-light dark:text-text-muted-dark hover:text-primary"/>
                    <IconButton icon={Shield} onClick={() => setIsSecurityModalOpen(true)} title="Security Center & API Requests" variant="ghost" size="md" className="text-text-muted-light dark:text-text-muted-dark hover:text-primary"/>
                    {/* NEW USERS BUTTON */}
                    <IconButton icon={Users} onClick={() => setIsUserChatsModalOpen(true)} title="User Management & Chats" variant="ghost" size="md" className="text-text-muted-light dark:text-text-muted-dark hover:text-primary"/>
                    <Button onClick={adminLogoutHandler} variant="danger" size="sm" leftIcon={<LogOut size={16}/>}> Logout Admin </Button>
                </div>
            </header>

            <AdminDocumentUpload onUploadSuccess={() => fetchAdminData(false)} />
            
            <div className="card-base p-0 sm:p-4 mt-6">
                <h2 className="text-lg font-semibold mb-3 text-text-light dark:text-text-dark px-4 sm:px-0 pt-4 sm:pt-0">
                    Uploaded Admin Documents
                </h2>
                {isLoading && ( <div className="flex items-center justify-center p-6"> <Loader2 size={24} className="animate-spin text-primary mr-2" /> Loading documents... </div> )}
                {error && !isLoading && ( <div className="p-3 my-3 mx-4 sm:mx-0 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 rounded-md text-sm flex items-center gap-2"> <AlertTriangle size={18} /> {error} <button onClick={() => fetchAdminData(true)} className="ml-auto text-xs underline hover:text-red-400">Retry</button> </div> )}
                {!isLoading && !error && documents.length === 0 && ( <p className="text-center text-sm text-text-muted-light dark:text-text-muted-dark py-6 px-4 sm:px-0"> No admin documents uploaded yet. </p> )}
                {!isLoading && !error && documents.length > 0 && (
                    <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="px-3 sm:px-4 py-2.5 font-medium">Original Name</th>
                                    <th className="px-3 sm:px-4 py-2.5 font-medium hidden md:table-cell">Uploaded</th>
                                    <th className="px-3 sm:px-4 py-2.5 font-medium">Analysis Status</th>
                                    <th className="px-3 sm:px-4 py-2.5 font-medium text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {documents.map((doc) => (
                                    <tr key={doc.serverFilename} className="border-b border-border-light dark:border-border-dark hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td className="px-3 sm:px-4 py-2 truncate max-w-[150px] sm:max-w-xs" title={doc.originalName}>{doc.originalName}</td>
                                        <td className="px-3 sm:px-4 py-2 whitespace-nowrap hidden md:table-cell"> {doc.uploadedAt ? format(new Date(doc.uploadedAt), 'MMM d, yyyy HH:mm') : 'N/A'} </td>
                                        <td className="px-3 sm:px-4 py-2"> {(doc.hasFaq || doc.hasTopics || doc.hasMindmap) ? ( <span className="flex items-center text-green-600 dark:text-green-400 text-xs"><CheckCircle size={14} className="mr-1"/> Generated</span> ) : (doc.analysisUpdatedAt ? <span className="text-gray-500 dark:text-gray-400 text-xs">Empty/Skipped</span> : <span className="text-yellow-500 dark:text-yellow-400 text-xs">Pending</span>)} </td>
                                        <td className="px-1 sm:px-4 py-2 text-center whitespace-nowrap">
                                            <IconButton icon={Eye} title="View Analysis" size="sm" variant="ghost" className="text-primary hover:text-primary-dark mr-0.5 sm:mr-1" onClick={() => handleViewAnalysis(doc)} disabled={isLoadingAnalysis && currentDocForModal?.serverFilename === doc.serverFilename} />
                                            <IconButton icon={Trash2} title="Delete Document" size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => handleDeleteDocument(doc.serverFilename, doc.originalName)} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal isOpen={isAnalysisModalOpen} onClose={() => setIsAnalysisModalOpen(false)} title={`Analysis Results: ${currentDocForModal?.originalName || 'Document'}`} size="2xl">
                {renderAnalysisModalContent()}
            </Modal>

            <Modal isOpen={isSecurityModalOpen} onClose={() => setIsSecurityModalOpen(false)} title="Security Center" size="3xl">
                {isLoadingRequests ? (
                    <div className="flex justify-center items-center p-8"> <Loader2 size={24} className="animate-spin text-primary inline-block mr-2" /> Loading Security Data... </div>
                ) : ( <ApiKeyRequestManager requests={keyRequests} onAction={() => fetchAdminData(false)} /> )}
            </Modal>

            {/* NEW USER CHATS MODAL */}
            <Modal isOpen={isUserChatsModalOpen} onClose={() => setIsUserChatsModalOpen(false)} title="User Session Summaries" size="4xl">
                {isLoadingUserChats ? (
                     <div className="flex justify-center items-center p-8"> <Loader2 size={24} className="animate-spin text-primary inline-block mr-2" /> Loading User Chat Data... </div>
                ) : ( <UserChatManager usersWithChats={usersWithChats} /> )}
            </Modal>

        </div>
    );
}

export default AdminDashboardPage;