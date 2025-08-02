// frontend/src/components/documents/SourceIngestion.jsx
import React, { useState, useRef } from 'react';
import api from '../../services/api.js';
import toast from 'react-hot-toast';
import { UploadCloud, FileText, XCircle, Paperclip, Link as LinkIcon } from 'lucide-react';
import Button from '../core/Button.jsx';

function SourceIngestion({ onSourceAdded }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [urlInput, setUrlInput] = useState('');
    const [isIngestingUrl, setIsIngestingUrl] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        if (isUploading) return;
        const file = e.target.files?.[0];
        if (file) setSelectedFile(file);
    };

    const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); if (isUploading) return; setDragActive(e.type === "dragenter" || e.type === "dragover"); };
    const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); if (isUploading) return; setDragActive(false); const file = e.dataTransfer.files?.[0]; if (file) setSelectedFile(file); };

    const handleUpload = async () => {
        if (!selectedFile) {
            toast.error("Please select a file to upload.");
            return;
        }
        setIsUploading(true);
        const toastId = toast.loading(`Uploading "${selectedFile.name}"... This may take a moment.`);
        
        const formData = new FormData();
        formData.append("file", selectedFile);
        
        try {
            await api.uploadFile(formData);
            toast.success(`'${selectedFile.name}' accepted! Processing has begun.`, { id: toastId, duration: 4000 });
            setSelectedFile(null);
            if (onSourceAdded) onSourceAdded();
        } catch (error) {
            const msg = error.response?.data?.message || error.message || "Upload failed.";
            toast.error(`Upload failed: ${msg}`, { id: toastId });
        } finally {
            setIsUploading(false);
        }
    };

    const handleIngestUrl = async () => {
        const url = urlInput.trim();
        if (!url) {
            toast.error("Please enter a valid URL.");
            return;
        }
        setIsIngestingUrl(true);
        const toastId = toast.loading(`Ingesting URL: ${url.substring(0, 30)}...`);
        try {
            await api.addUrlSource(url);
            toast.success("URL accepted! Processing has begun in the background.", { id: toastId });
            setUrlInput('');
            if (onSourceAdded) onSourceAdded();
        } catch (error) {
            const msg = error.response?.data?.message || error.message || "Failed to ingest URL.";
            toast.error(msg, { id: toastId });
        } finally {
            setIsIngestingUrl(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* --- File Upload Section --- */}
            <div>
                <label
                    htmlFor="file-upload-input"
                    onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center w-full h-28 px-4 transition-colors duration-200 ease-in-out bg-surface-light dark:bg-gray-800 border-2 border-dashed rounded-lg cursor-pointer border-border-light dark:border-border-dark hover:border-primary dark:hover:border-primary-light ${dragActive ? "border-primary dark:border-primary-light ring-2 ring-primary dark:ring-primary-light bg-primary/10 dark:bg-primary-dark/20" : ""}`}
                >
                    <div className="flex flex-col items-center justify-center text-center">
                        <Paperclip size={28} className={`mb-1 transition-colors ${dragActive ? 'text-primary dark:text-primary-light' : 'text-text-muted-light dark:text-text-muted-dark'}`} />
                        <p className="text-sm text-text-muted-light dark:text-text-muted-dark"><span className="font-semibold text-primary dark:text-primary-light">Upload a file</span> or drag & drop</p>
                        <p className="text-xs text-text-muted-light/70 dark:text-text-muted-dark/70">PDF, DOCX, Media, etc.</p>
                    </div>
                    <input ref={fileInputRef} id="file-upload-input" type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.docx,.txt,.md,.mp3,.wav,.mp4,.mov,.png,.jpg,.jpeg" />
                </label>
                {selectedFile && (
                    <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-between text-sm animate-fadeIn">
                        <div className="flex items-center gap-2 truncate">
                            <FileText size={18} className="text-primary flex-shrink-0" />
                            <span className="truncate text-text-light dark:text-text-dark" title={selectedFile.name}>{selectedFile.name}</span>
                        </div>
                        <button onClick={() => setSelectedFile(null)} className="p-1 rounded-full text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors hover:bg-red-500/10">
                            <XCircle size={18} />
                        </button>
                    </div>
                )}
                <Button onClick={handleUpload} fullWidth className="mt-2 text-sm" variant="primary" isLoading={isUploading} disabled={!selectedFile || isUploading} leftIcon={<UploadCloud size={16} />}>
                    Process File
                </Button>
            </div>

            {/* --- URL Ingestion Section --- */}
            <div className="relative pt-4 border-t border-border-light dark:border-border-dark">
                <p className="text-center text-xs text-text-muted-light dark:text-text-muted-dark absolute -top-2.5 left-1/2 -translate-x-1/2 bg-surface-light dark:bg-surface-dark px-2">OR</p>
                <div className="flex items-center gap-2">
                    <div className="relative flex-grow">
                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted-light dark:text-text-muted-dark" />
                        <input
                            id="url-input"
                            type="url"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            placeholder="Enter YouTube or webpage URL..."
                            className="input-field !pl-9 !py-2 !text-sm w-full"
                            disabled={isIngestingUrl}
                        />
                    </div>
                    <Button onClick={handleIngestUrl} size="md" className="!px-3 !py-2" isLoading={isIngestingUrl} disabled={!urlInput.trim() || isIngestingUrl}>
                        Ingest
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default SourceIngestion;