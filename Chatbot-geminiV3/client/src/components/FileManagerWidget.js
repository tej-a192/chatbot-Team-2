// client/src/components/FileManagerWidget.js
import React, { useState, useEffect, useCallback } from 'react';
import { getUserFiles, renameUserFile, deleteUserFile } from '../services/api';

const getFileIcon = (type) => {
  switch (type) {
    case 'docs': return '📄';
    case 'images': return '🖼️';
    case 'code': return '💻';
    default: return '📁';
  }
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (typeof bytes !== 'number' || bytes < 0) return 'N/A';
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const index = Math.max(0, Math.min(i, sizes.length - 1));
  return parseFloat((bytes / Math.pow(k, index)).toFixed(1)) + ' ' + sizes[index];
};


const FileManagerWidget = ({ refreshTrigger }) => {
  const [userFiles, setUserFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [renamingFile, setRenamingFile] = useState(null);
  const [newName, setNewName] = useState('');
  const [statusMessage, setStatusMessage] = useState(''); // <<< ADDED: For success/general status

  const fetchUserFiles = useCallback(async () => {
    const currentUserId = localStorage.getItem('userId');
    if (!currentUserId) {
        console.log("FileManager: Skipping fetch, no userId.");
        setUserFiles([]);
        return;
    }
    setIsLoading(true);
    setError('');
    setStatusMessage(''); // Clear status message on fetch
    try {
      const response = await getUserFiles();
      setUserFiles(response.data || []);
    } catch (err) {
      console.error("Error fetching user files:", err);
      setError(err.response?.data?.message || 'Failed to load files.');
      setUserFiles([]);
      if (err.response?.status === 401) {
          console.warn("FileManager: Received 401, potential logout needed.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserFiles();
  }, [refreshTrigger, fetchUserFiles]);

  const handleRenameClick = (file) => {
    setRenamingFile(file.serverFilename);
    setNewName(file.originalName);
    setError('');
    setStatusMessage(''); // Clear status message
  };

  const handleRenameCancel = () => {
    setRenamingFile(null);
    setNewName('');
    setError('');
    setStatusMessage(''); // Clear status message
  };

  const handleRenameSave = async () => {
    if (!renamingFile || !newName.trim()) {
         setError('New name cannot be empty.');
         return;
    }
    if (newName.includes('/') || newName.includes('\\')) {
        setError('New name cannot contain slashes.');
        return;
    }
    setIsLoading(true);
    setError('');
    setStatusMessage(''); // Clear status message
    try {
      await renameUserFile(renamingFile, newName.trim());
      setRenamingFile(null);
      setNewName('');
      fetchUserFiles(); // Refreshes and clears messages
      setStatusMessage('File renamed successfully!'); // <<< ADDED: Set success message
      setTimeout(() => setStatusMessage(''), 5000); // Clear after 5 seconds
    } catch (err) {
      console.error("Error renaming file:", err);
      setError(err.response?.data?.message || 'Failed to rename file.');
       if (err.response?.status === 401) {
          console.warn("FileManager: Received 401 during rename.");
      }
    } finally {
       setIsLoading(false);
    }
  };

  const handleRenameInputKeyDown = (e) => {
      if (e.key === 'Enter') {
          handleRenameSave();
      } else if (e.key === 'Escape') {
          handleRenameCancel();
      }
  };

  const handleDeleteFile = async (serverFilename, originalName) => {
    // <<< MODIFIED: Updated confirmation message
    if (!window.confirm(`Are you sure you want to delete "${originalName}"? This will remove the file and all associated data (analysis, graph, vector embeddings). This cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    setError('');
    setStatusMessage(''); // <<< ADDED: Clear previous messages

    try {
      // <<< MODIFIED: deleteUserFile should return the full Axios response
      const response = await deleteUserFile(serverFilename);

      // <<< MODIFIED: Handle more informative backend responses
      if (response.status === 200 || response.status === 207) {
        setStatusMessage(response.data.message || `Deletion process for '${originalName}' completed.`);
        console.log("Deletion API Response:", response.data);
        fetchUserFiles(); // Refresh the file list
      } else {
        // This case might not be hit if axios throws for non-2xx, but good for robustness
        setError(response.data.message || 'File deletion failed with an unexpected status.');
      }
    } catch (err) {
      console.error("Error deleting file:", err.response || err);
      // <<< MODIFIED: Extract error message from backend response
      const apiErrorMessage = err.response?.data?.message || 'Failed to delete file. Please try again.';
      setError(apiErrorMessage);

      if (err.response?.data?.details) { // Log backend details if available
          console.log("Deletion attempt details from backend:", err.response.data.details);
      }

       if (err.response?.status === 401) {
          console.warn("FileManager: Received 401 during delete.");
          // Consider triggering logout or displaying specific auth error
      }
    } finally {
       setIsLoading(false);
       // <<< MODIFIED: Clear status message after a delay only if it was a success/status message
       if (statusMessage && !error) {
           setTimeout(() => setStatusMessage(''), 7000);
       }
    }
  };

  return (
    <div className="file-manager-widget">
      <div className="fm-header">
        <h4>Your Uploaded Files</h4>
        <button
            onClick={fetchUserFiles}
            disabled={isLoading}
            className="fm-refresh-btn"
            title="Refresh File List"
        >
            🔄
        </button>
      </div>

      {/* <<< MODIFIED: Display status or error messages */}
      {statusMessage && !error && <div className="fm-status-message">{statusMessage}</div>}
      {error && <div className="fm-error">{error}</div>}


      <div className="fm-file-list-container">
        {/* <<< MODIFIED: Added !statusMessage to the condition for "No files uploaded yet" */}
        {isLoading && userFiles.length === 0 ? (
          <p className="fm-loading">Loading files...</p>
        ) : userFiles.length === 0 && !isLoading && !error && !statusMessage ? (
          <p className="fm-empty">No files uploaded yet.</p>
        ) : (
          <ul className="fm-file-list">
            {userFiles.map((file) => (
              <li key={file.serverFilename} className="fm-file-item">
                <span className="fm-file-icon">{getFileIcon(file.type)}</span>
                <div className="fm-file-details">
                  {renamingFile === file.serverFilename ? (
                    <div className="fm-rename-section">
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={handleRenameInputKeyDown}
                        autoFocus
                        className="fm-rename-input"
                        aria-label={`New name for ${file.originalName}`}
                      />
                      <button onClick={handleRenameSave} disabled={isLoading || !newName.trim()} className="fm-action-btn fm-save-btn" title="Save Name">✔️</button>
                      <button onClick={handleRenameCancel} disabled={isLoading} className="fm-action-btn fm-cancel-btn" title="Cancel Rename">❌</button>
                    </div>
                  ) : (
                    <>
                      <span className="fm-file-name" title={file.originalName}>{file.originalName}</span>
                      <span className="fm-file-size">{formatFileSize(file.size)}</span>
                    </>
                  )}
                </div>
                {renamingFile !== file.serverFilename && (
                  <div className="fm-file-actions">
                    <button
                        onClick={() => handleRenameClick(file)}
                        disabled={isLoading || !!renamingFile}
                        className="fm-action-btn fm-rename-btn"
                        title="Rename"
                    >
                       ✏️
                    </button>
                    <button
                        onClick={() => handleDeleteFile(file.serverFilename, file.originalName)}
                        disabled={isLoading || !!renamingFile}
                        className="fm-action-btn fm-delete-btn"
                        title="Delete"
                    >
                        🗑️
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
         {isLoading && userFiles.length > 0 && <p className="fm-loading fm-loading-bottom">Processing...</p>}
      </div>
    </div>
  );
};

// --- CSS for FileManagerWidget ---
const FileManagerWidgetCSS = `
/* client/src/components/FileManagerWidget.css */
.file-manager-widget { display: flex; flex-direction: column; gap: 10px; padding: 15px 0px 15px 20px; box-sizing: border-box; height: 100%; overflow: hidden; }
.fm-header { display: flex; justify-content: space-between; align-items: center; padding-right: 20px; flex-shrink: 0; }
.file-manager-widget h4 { margin: 0; color: var(--text-primary); font-size: 0.95rem; font-weight: 600; }
.fm-refresh-btn { background: none; border: 1px solid var(--border-color); color: var(--text-secondary); padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 0.9rem; line-height: 1; transition: color 0.2s, border-color 0.2s, background-color 0.2s; }
.fm-refresh-btn:hover:not(:disabled) { color: var(--text-primary); border-color: #555; background-color: #3a3a40; }
.fm-refresh-btn:disabled { cursor: not-allowed; opacity: 0.5; }

/* <<< MODIFIED: Consolidated message styling and added .fm-status-message */
.fm-error, .fm-loading, .fm-empty, .fm-status-message { 
  font-size: 0.85rem; 
  padding: 10px 15px; 
  border-radius: 4px; 
  text-align: center; 
  margin: 5px 20px 5px 0; 
  flex-shrink: 0; 
}
.fm-error { 
  color: var(--error-color, #f44336); /* Fallback to a default red */
  border: 1px solid var(--error-color, #f44336); 
  background-color: var(--error-bg, rgba(244, 67, 54, 0.1)); 
}
.fm-status-message { /* Styling for general status/success messages */
  color: var(--success-color, #4CAF50); /* Fallback to a default green */
  background-color: var(--success-bg, rgba(76, 175, 80, 0.1));
  border: 1px solid var(--success-color-border, #c8e6c9);
  font-style: normal; /* Not italic like loading/empty */
}
.fm-loading, .fm-empty { color: var(--text-secondary); font-style: italic; }
/* End of modified message styling */

.fm-loading-bottom { margin-top: auto; padding: 5px; }
.fm-file-list-container { flex-grow: 1; overflow-y: auto; padding-right: 10px; margin-right: 10px; position: relative; }
.fm-file-list-container::-webkit-scrollbar { width: 8px; }
.fm-file-list-container::-webkit-scrollbar-track { background: transparent; }
.fm-file-list-container::-webkit-scrollbar-thumb { background-color: #4a4a50; border-radius: 10px; }
.fm-file-list-container { scrollbar-width: thin; scrollbar-color: #4a4a50 transparent; }
.fm-file-list { list-style: none; padding: 0; margin: 0; }
.fm-file-item { display: flex; align-items: center; padding: 8px 5px; margin-bottom: 5px; border-radius: 4px; background-color: #2f2f34; transition: background-color 0.2s ease; gap: 10px; }
.fm-file-item:hover { background-color: #3a3a40; }
.fm-file-icon { flex-shrink: 0; font-size: 1.1rem; line-height: 1; }
.fm-file-details { flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; justify-content: center; min-height: 30px; }
.fm-file-name { font-size: 0.85rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fm-file-size { font-size: 0.7rem; color: var(--text-secondary); margin-top: 2px; }
.fm-file-actions { display: flex; gap: 5px; flex-shrink: 0; margin-left: auto; }
.fm-action-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 3px; font-size: 1rem; line-height: 1; border-radius: 3px; transition: color 0.2s ease, background-color 0.2s ease; }
.fm-action-btn:hover:not(:disabled) { color: var(--text-primary); background-color: #4a4a50; }
.fm-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.fm-delete-btn:hover:not(:disabled) { color: var(--error-color); }
.fm-rename-btn:hover:not(:disabled) { color: var(--accent-blue-light); }
.fm-save-btn:hover:not(:disabled) { color: #52c41a; } /* Green */
.fm-cancel-btn:hover:not(:disabled) { color: #ffc107; } /* Orange/Yellow */
.fm-rename-section { display: flex; align-items: center; gap: 5px; width: 100%; }
.fm-rename-input { flex-grow: 1; padding: 4px 8px; background-color: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; font-size: 0.85rem; outline: none; min-width: 50px; }
.fm-rename-input:focus { border-color: var(--accent-blue); }
`;
// --- Inject CSS ---
const styleTagFileManagerId = 'file-manager-widget-styles';
if (!document.getElementById(styleTagFileManagerId)) {
    const styleTag = document.createElement("style");
    styleTag.id = styleTagFileManagerId;
    styleTag.type = "text/css";
    styleTag.innerText = FileManagerWidgetCSS;
    document.head.appendChild(styleTag);
}
// --- End CSS Injection ---

export default FileManagerWidget;