

// frontend/src/components/documents/DocumentList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api.js'; // Mocked for V1
import toast from 'react-hot-toast';
import { FileText, Edit3, Trash2, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import IconButton from '../core/IconButton.jsx'; // Make sure IconButton is imported

// Props from LeftPanel: onSelectDocument is selectDocumentForAnalysis from AppStateContext
// selectedDocument is selectedDocumentForAnalysis from AppStateContext
function DocumentList({ onSelectDocument, selectedDocument }) { 
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchFiles = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const userFiles = await api.getFiles(); // Mocked call
            setFiles(Array.isArray(userFiles) ? userFiles : []);
        } catch (err) {
            setError(err.message || "Failed to fetch mock documents.");
            toast.error("Could not load mock documents.");
            console.error("Mock getFiles error:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    const handleRename = async (file, newOriginalName) => {
        if (!newOriginalName || newOriginalName === file.originalName) return;
        const toastId = toast.loading(`Renaming ${file.originalName} (mock)...`);
        try {
            await api.renameFile(file.serverFilename, newOriginalName); // Mocked
            toast.success(`Renamed to ${newOriginalName} (mock).`, { id: toastId });
            fetchFiles(); 
            if (selectedDocument?.serverFilename === file.serverFilename) {
                onSelectDocument({...file, originalName: newOriginalName});
            }
        } catch (err) {
            toast.error(`Mock rename failed: ${err.message}`, { id: toastId });
        }
    };

    const handleDelete = async (file) => {
        if (!window.confirm(`MOCK: Are you sure you want to delete "${file.originalName}"?`)) return;
        const toastId = toast.loading(`Deleting ${file.originalName} (mock)...`);
        try {
            await api.deleteFile(file.serverFilename); // Mocked
            toast.success(`${file.originalName} deleted (mock).`, { id: toastId });
            fetchFiles();
            if (selectedDocument?.serverFilename === file.serverFilename) {
                onSelectDocument(null); 
            }
        } catch (err) {
            toast.error(`Mock delete failed: ${err.message}`, { id: toastId });
        }
    };
    
    if (loading) {
        return (
            <div className="flex items-center justify-center p-4 text-text-muted-light dark:text-text-muted-dark">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading documents...
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 rounded-md text-sm flex items-center gap-2">
                <AlertTriangle size={18} /> {error} 
                <button onClick={fetchFiles} className="ml-auto text-xs underline hover:text-red-400">Retry</button>
            </div>
        );
    }
    
    if (files.length === 0) {
        return <p className="text-center text-xs text-text-muted-light dark:text-text-muted-dark p-4">No documents uploaded (mock data is empty or not loading).</p>;
    }

    return (
        <div className="space-y-1.5 text-xs custom-scrollbar pr-1"> {/* Added pr-1 for scrollbar */}
            {files.map(file => {
                const isSelected = selectedDocument?.serverFilename === file.serverFilename;
                return (
                    <div 
                        key={file.serverFilename} 
                        onClick={() => onSelectDocument(isSelected ? null : file)} // Call the prop
                        className={`p-2.5 bg-surface-light dark:bg-gray-800 border rounded-md flex items-center justify-between hover:shadow-md transition-all duration-150 cursor-pointer
                                    ${isSelected 
                                        ? 'ring-2 ring-primary dark:ring-primary-light shadow-lg border-primary dark:border-primary-light' 
                                        : 'border-border-light dark:border-border-dark hover:border-gray-400 dark:hover:border-gray-500'}`}
                        title={`Select ${file.originalName} for analysis`}
                    >
                        <div className="flex items-center gap-2 truncate">
                            {isSelected ? 
                                <CheckCircle size={16} className="text-green-500 flex-shrink-0" /> :
                                <FileText size={16} className={`${isSelected ? 'text-white dark:text-primary-light' : 'text-primary dark:text-primary-light'} flex-shrink-0`} />
                            }
                            <span className={`truncate ${isSelected ? 'font-semibold text-primary dark:text-primary-light' : 'text-text-light dark:text-text-dark'}`} >
                                {file.originalName}
                            </span>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-0.5"> {/* Reduced gap for smaller buttons */}
                            <IconButton icon={Edit3} size="sm" variant="ghost" title="Rename"
                                onClick={(e) => { e.stopPropagation(); const newN = prompt(`Rename "${file.originalName}" to:`, file.originalName); if(newN && newN.trim() !== '' && newN !== file.originalName) handleRename(file, newN.trim()); }}
                                className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 p-1" // Smaller padding
                            />
                            <IconButton icon={Trash2} size="sm" variant="ghost" title="Delete"
                                onClick={(e) => { e.stopPropagation(); handleDelete(file);}}
                                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1" // Smaller padding
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
export default DocumentList;