// frontend/src/components/documents/DocumentUpload.jsx
import React, { useState } from 'react';
import api from '../../services/api.js'; // Mocked for V1
import toast from 'react-hot-toast';
import { UploadCloud, FileText, XCircle, Paperclip } from 'lucide-react'; // Added Paperclip as per your icon list
import Button from '../core/Button.jsx'; // Use our custom Button

function DocumentUpload({ onUploadSuccess }) {
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [dragActive, setDragActive] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
            // toast.info(`File selected: ${e.target.files[0].name}`);
        }
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setSelectedFile(e.dataTransfer.files[0]);
            // toast.info(`File dropped: ${e.dataTransfer.files[0].name}`);
        }
    };

    const handleUpload = async () => {
        if (!selectedFile) {
            toast.error("Please select a file first.");
            return;
        }
        setIsUploading(true);
        setUploadProgress(0);
        const toastId = toast.loading(`Uploading ${selectedFile.name}... 0%`);
        
        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            // Simulate API call progress for mock
            if (typeof api.uploadFile === 'function' && api.uploadFile.constructor.name === 'AsyncFunction') {
                 await api.uploadFile(formData, (event) => { // Pass onUploadProgress callback
                    if (event.lengthComputable) {
                        const percent = Math.round((event.loaded * 100) / event.total);
                        setUploadProgress(percent);
                        toast.loading(`Uploading ${selectedFile.name}... ${percent}%`, { id: toastId, duration: 5000 });
                    }
                });
            } else { // Fallback for simpler mock without progress simulation in api.js
                 await api.uploadFile(formData); // Call the mock
                 // Simulate progress manually for UI testing if api.js mock doesn't
                 for (let p = 0; p <= 100; p += 20) {
                    await new Promise(res => setTimeout(res, 100));
                    setUploadProgress(p);
                    toast.loading(`Uploading ${selectedFile.name}... ${p}%`, { id: toastId, duration: 5000 });
                 }
            }

            toast.success(`${selectedFile.name} uploaded & processing (mock).`, { id: toastId, duration: 3000 });
            setSelectedFile(null);
            const fileInput = document.getElementById('file-upload-input');
            if(fileInput) fileInput.value = null; // Clear file input
            if (onUploadSuccess) onUploadSuccess(); // To refresh DocumentList
        } catch (error) {
            toast.error(`Upload failed: ${error.message || 'Unknown mock error'}`, { id: toastId, duration: 3000 });
            console.error("Upload failed (mock):", error);
        } finally {
            setIsUploading(false);
            // setUploadProgress(0); // Progress bar will disappear, or keep it at 100 for a moment
        }
    };

    // Icon for upload area - Using Paperclip as per your icon request
    const UploadAreaIcon = Paperclip;

    return (
        <div className="mb-4 p-1">
            <label 
                htmlFor="file-upload-input"
                onDragEnter={handleDrag} 
                onDragLeave={handleDrag} 
                onDragOver={handleDrag} 
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center w-full h-36 px-4 transition-colors duration-200 ease-in-out
                            bg-surface-light dark:bg-gray-800 
                            border-2 border-dashed rounded-lg cursor-pointer 
                            border-border-light dark:border-border-dark 
                            hover:border-primary dark:hover:border-primary-light
                            ${dragActive ? "border-primary dark:border-primary-light ring-2 ring-primary dark:ring-primary-light bg-primary/10 dark:bg-primary-dark/20" : ""}
                            ${isUploading ? "opacity-60 cursor-not-allowed" : ""}`}
            >
                <div className="flex flex-col items-center justify-center text-center">
                    <UploadAreaIcon size={36} className={`mb-2 transition-colors ${dragActive ? 'text-primary dark:text-primary-light' : 'text-text-muted-light dark:text-text-muted-dark'}`} />
                    <p className="mb-1 text-xs sm:text-sm text-text-muted-light dark:text-text-muted-dark">
                        <span className="font-semibold text-primary dark:text-primary-light">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-[0.7rem] sm:text-xs text-text-muted-light dark:text-text-muted-dark">PDF, DOCX, TXT, PPTX, code files</p>
                </div>
                <input id="file-upload-input" type="file" className="hidden" onChange={handleFileChange} disabled={isUploading} 
                       accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.py,.js,.md,.html,.xml,.json,.csv,.log,.c,.cpp,.java" />
            </label>

            {selectedFile && (
                <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-between text-sm animate-fadeIn">
                    <div className="flex items-center gap-2 truncate">
                        <FileText size={18} className="text-primary flex-shrink-0" />
                        <span className="truncate text-text-light dark:text-text-dark" title={selectedFile.name}>{selectedFile.name}</span>
                        <span className="text-text-muted-light dark:text-text-muted-dark text-xs whitespace-nowrap">
                            ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </span>
                    </div>
                    {!isUploading && (
                        <button onClick={() => setSelectedFile(null)} className="text-red-500 hover:text-red-700 dark:hover:text-red-400 transition-colors p-1 rounded-full hover:bg-red-500/10">
                            <XCircle size={18} />
                        </button>
                    )}
                </div>
            )}
            
            {isUploading && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2 overflow-hidden">
                    <div 
                        className="bg-primary h-1.5 rounded-full transition-all duration-300 ease-linear" 
                        style={{ width: `${uploadProgress}%` }}
                    ></div>
                </div>
            )}

            <Button
                onClick={handleUpload}
                fullWidth
                className="mt-3 text-sm" // Uses .btn and .btn-primary styles from index.css
                variant="primary" 
                isLoading={isUploading}
                disabled={!selectedFile || isUploading} // Disable if no file or already uploading
                leftIcon={!isUploading ? <UploadCloud size={16} /> : null}
            >
                {isUploading ? `Uploading ${uploadProgress}%...` : "Upload Document"}
            </Button>
        </div>
    );
}
export default DocumentUpload;