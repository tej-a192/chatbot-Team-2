// frontend/src/components/documents/KnowledgeSourceList.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api.js';
import toast from 'react-hot-toast';
import {
    FileText, CheckCircle, Loader2, AlertTriangle, Trash2,
    Youtube, Globe, Library
} from 'lucide-react';
import IconButton from '../core/IconButton.jsx';
import { formatDistanceToNow } from 'date-fns';

const getSourceIcon = (sourceType) => {
    const icons = {
        'document': FileText,
        'youtube': Youtube,
        'webpage': Globe,
        'subject': Library, // Admin-provided subject
        'audio': FileText,
        'video': FileText,
        'image': FileText
    };
    return icons[sourceType] || FileText;
};

// --- THIS IS THE FIX ---
// A robust function to format dates that handles invalid inputs gracefully.
const formatRelativeTime = (dateString) => {
    if (!dateString) {
        return 'date unknown';
    }
    try {
        const date = new Date(dateString);
        // The isNaN check is a reliable way to see if a Date object is valid.
        if (isNaN(date.getTime())) {
            return 'invalid date';
        }
        return formatDistanceToNow(date, { addSuffix: true });
    } catch (e) {
        console.error("Date formatting error:", e);
        return 'date error';
    }
};
// --- END OF FIX ---

function KnowledgeSourceList({ onSelectSource, selectedSource, onRefreshNeeded }) {
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchSources = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.getKnowledgeSources();
            setSources(Array.isArray(response) ? response : []);
        } catch (err) {
            setError(err.message || "Failed to fetch knowledge sources.");
            toast.error("Could not load knowledge base.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSources();
    }, [fetchSources, onRefreshNeeded]); // Refresh when the key changes

    const handleDelete = async (sourceId, sourceTitle, sourceType) => {
        if (sourceType === 'subject') return; // Should not happen as button is disabled
        if (!window.confirm(`Are you sure you want to delete "${sourceTitle}"? This will remove it and all its associated data.`)) return;
        
        const toastId = toast.loading(`Deleting ${sourceTitle}...`);
        try {
            // Distinguish between legacy user doc and new knowledge source
            if (sourceType === 'document' && !sourceId.startsWith('admin_')) {
                 await api.deleteFile(sourceTitle); // Legacy docs are deleted by filename
            } else {
                 await api.deleteKnowledgeSource(sourceId);
            }
           
            toast.success(`"${sourceTitle}" deleted.`, { id: toastId });
            fetchSources(); // Re-fetch the list
            if (selectedSource === sourceTitle) {
                onSelectSource(null);
            }
        } catch (err) {
            toast.error(`Delete failed: ${err.message}`, { id: toastId });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-4 text-text-muted-light dark:text-text-muted-dark">
                <Loader2 size={20} className="animate-spin mr-2" /> Loading knowledge base...
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 rounded-md text-sm flex items-center gap-2">
                <AlertTriangle size={18} /> {error}
                <button onClick={fetchSources} className="ml-auto text-xs underline hover:text-red-400">Retry</button>
            </div>
        );
    }

    if (sources.length === 0) {
        return <p className="text-center text-xs text-text-muted-light dark:text-text-muted-dark p-4">Your knowledge base is empty.</p>;
    }

    return (
        <div className="space-y-1.5 text-xs custom-scrollbar pr-1">
            {sources.map(source => {
                const isSelected = selectedSource === source.title;
                const isProcessing = source.status && source.status.startsWith('processing');
                const isFailed = source.status === 'failed';
                const isSelectable = source.status === 'completed';
                const Icon = getSourceIcon(source.sourceType);

                return (
                    <div
                        key={source._id}
                        onClick={() => isSelectable && onSelectSource(isSelected ? null : source.title)}
                        className={`p-2.5 bg-surface-light dark:bg-gray-800 border rounded-md flex items-center justify-between transition-all duration-150
                                    ${isSelectable ? 'cursor-pointer hover:shadow-md' : 'cursor-default opacity-80'}
                                    ${isSelected ? 'ring-2 ring-primary dark:ring-primary-light shadow-lg border-primary dark:border-primary-light' : 'border-border-light dark:border-border-dark'}`}
                        title={isSelectable ? `Select ${source.title}` : `Status: ${source.status}`}
                    >
                        <div className="flex items-center gap-2 truncate">
                            {isSelected ? <CheckCircle size={16} className="text-green-500 flex-shrink-0" /> : <Icon size={16} className="text-primary dark:text-primary-light flex-shrink-0" />}
                            <div className="truncate">
                                <span className={`block truncate ${isSelected ? 'font-semibold text-primary dark:text-primary-light' : 'text-text-light dark:text-text-dark'}`}>{source.title}</span>
                                <span className="text-[0.7rem] text-text-muted-light dark:text-text-muted-dark">
                                    {/* --- THIS IS THE FIX --- */}
                                    {formatRelativeTime(source.createdAt)}
                                    {/* --- END OF FIX --- */}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                             {isProcessing && <Loader2 size={14} className="animate-spin text-accent" />}
                             {isFailed && <AlertTriangle size={14} className="text-red-500" title="Processing failed" />}
                             {source.sourceType !== 'subject' && (
                                <IconButton icon={Trash2} size="sm" variant="ghost" title="Delete"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(source._id, source.title, source.sourceType); }}
                                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1"
                                />
                             )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default KnowledgeSourceList;