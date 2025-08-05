// frontend/src/components/chat/DocumentDownloadBubble.jsx
import React, { useState, useEffect, useRef } from 'react';
import { FileText, Presentation as FilePresentation, Download, CheckCircle } from 'lucide-react';
import Button from '../core/Button.jsx';
import api from '../../services/api.js';
import toast from 'react-hot-toast';

const DocumentDownloadBubble = ({ payload }) => {
    const [downloadState, setDownloadState] = useState('idle'); // 'idle', 'downloading', 'done', 'failed'
    const { filename, docType, title } = payload;
    const hasTriggeredDownload = useRef(false); // Ref to prevent re-running in Strict Mode

    const Icon = docType === 'pptx' ? FilePresentation : FileText;

    // This effect is now structured to run exactly once when the component mounts.
    useEffect(() => {
        // 1. Check the ref to prevent running more than once.
        if (hasTriggeredDownload.current) {
            return;
        }
        hasTriggeredDownload.current = true;

        // 2. Define the async download logic inside the effect.
        const triggerDownload = async () => {
            setDownloadState('downloading');
            const toastId = toast.loading(`Preparing '${title}' for download...`);
            try {
                const { fileBlob, resolvedFilename } = await api.downloadGeneratedDocument(filename);
                
                const url = window.URL.createObjectURL(fileBlob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', resolvedFilename);
                document.body.appendChild(link);
                link.click();
                
                // Cleanup
                link.parentNode.removeChild(link);
                window.URL.revokeObjectURL(url);
                
                toast.success("Download started!", { id: toastId });
                setDownloadState('done');
            } catch (error) {
                toast.error(`Auto-download failed: ${error.message}`, { id: toastId });
                setDownloadState('failed'); // Set a 'failed' state to allow manual retry
            }
        };

        // 3. Call the download function.
        triggerDownload();

    }, [filename, title]); // Dependencies are stable, ensuring the effect runs only on mount.

    // A separate handler for the button, allowing manual retries if the auto-download fails.
    const handleManualDownload = async () => {
        if (downloadState === 'downloading' || downloadState === 'done') return;
        
        setDownloadState('downloading');
        const toastId = toast.loading(`Retrying download for '${title}'...`);
        try {
            const { fileBlob, resolvedFilename } = await api.downloadGeneratedDocument(filename);
            const url = window.URL.createObjectURL(fileBlob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', resolvedFilename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
            toast.success("Download started!", { id: toastId });
            setDownloadState('done');
        } catch (error) {
            toast.error(`Download failed again: ${error.message}`, { id: toastId });
            setDownloadState('failed');
        }
    };
    
    const isDownloading = downloadState === 'downloading';
    const isDone = downloadState === 'done';

    return (
        <div className="max-w-[85%] md:max-w-[75%] bg-surface-light dark:bg-surface-dark p-4 rounded-2xl rounded-bl-lg border border-border-light dark:border-border-dark shadow-md flex items-center gap-4 animate-fadeIn">
            <Icon size={40} className="text-primary flex-shrink-0" />
            <div className="flex-grow overflow-hidden">
                <p className="text-sm text-text-muted-light dark:text-text-muted-dark">Document Ready</p>
                <h4 className="font-semibold text-text-light dark:text-text-dark truncate" title={title}>
                    {title}
                </h4>
            </div>
            <Button 
                onClick={handleManualDownload} 
                isLoading={isDownloading} 
                disabled={isDownloading || isDone}
                leftIcon={isDone ? <CheckCircle size={16} /> : <Download size={16} />}
                size="md"
            >
                {isDownloading ? 'Downloading...' : isDone ? 'Downloaded' : 'Retry Download'}
            </Button>
        </div>
    );
};

export default DocumentDownloadBubble;