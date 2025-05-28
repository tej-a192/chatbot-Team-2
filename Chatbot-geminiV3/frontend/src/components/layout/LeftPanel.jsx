// frontend/src/components/layout/LeftPanel.jsx
import React, { useState, useEffect } from 'react';
import { useAppState } from '../../contexts/AppStateContext.jsx';
import DocumentUpload from '../documents/DocumentUpload.jsx';
import DocumentList from '../documents/DocumentList.jsx';   
import { PanelLeftClose, ChevronDown, ChevronUp, FilePlus, Settings2, Bot, BookOpen, Lightbulb } from 'lucide-react';
import IconButton from '../core/IconButton.jsx';
import { motion, AnimatePresence } from 'framer-motion'; // Added AnimatePresence here
import toast from 'react-hot-toast'; // For toast notifications

const PROMPT_PRESETS = [
    { id: 'friendly_tutor', name: 'Friendly Tutor', icon: Bot, text: "You are a friendly, patient, and encouraging tutor specializing in engineering and scientific topics for PhD students. Explain concepts clearly, break down complex ideas, use analogies, and offer positive reinforcement. Ask follow-up questions to ensure understanding." },
    { id: 'concept_explorer', name: 'Concept Explorer', icon: BookOpen, text: "You are an expert academic lecturer introducing a new, complex engineering or scientific concept. Your goal is to provide a deep, structured explanation. Define terms rigorously, outline the theory, provide relevant mathematical formulations (using Markdown), illustrative examples, and discuss applications or limitations pertinent to PhD-level research." },
    { id: 'knowledge_check', name: 'Knowledge Check', icon: Lightbulb, text: "You are assessing understanding of engineering/scientific topics. Ask targeted questions to test knowledge, identify misconceptions, and provide feedback on the answers. Start by asking the user what topic they want to be quizzed on." },
    { id: 'custom', name: 'Custom Prompt', icon: Settings2, text: "You are a helpful AI engineering tutor." }
];

function LeftPanel() {
    const { 
        setIsLeftPanelOpen, 
        systemPrompt, setSystemPrompt, 
        selectDocumentForAnalysis, selectedDocumentForAnalysis // Get these from AppStateContext
    } = useAppState();
    
    const [isPromptSectionOpen, setIsPromptSectionOpen] = useState(true);
    const [isDocManagementOpen, setIsDocManagementOpen] = useState(true);
    const [selectedPresetId, setSelectedPresetId] = useState('custom');

    useEffect(() => {
        const matchedPreset = PROMPT_PRESETS.find(p => p.text === systemPrompt);
        setSelectedPresetId(matchedPreset ? matchedPreset.id : 'custom');
    }, [systemPrompt]);

    const handlePresetChange = (event) => {
        const presetId = event.target.value;
        setSelectedPresetId(presetId);
        const selectedPreset = PROMPT_PRESETS.find(p => p.id === presetId);
        if (selectedPreset) {
            setSystemPrompt(selectedPreset.text);
        }
    };
    
    const [docListKey, setDocListKey] = useState(Date.now()); 
    const handleUploadSuccess = () => { 
        setDocListKey(Date.now()); 
        toast.success("Document list refreshed after upload.");
    };

    const SelectedPresetIcon = PROMPT_PRESETS.find(p => p.id === selectedPresetId)?.icon || Settings2;

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3 px-1 pt-1">
                <h2 className="text-sm font-semibold text-text-light dark:text-text-dark">Assistant Controls</h2>
                <IconButton 
                    icon={PanelLeftClose} 
                    onClick={() => setIsLeftPanelOpen(false)} 
                    title="Close Assistant Panel"
                    variant="ghost"
                    size="sm"
                    className="text-text-muted-light dark:text-text-muted-dark hover:text-primary"
                />
            </div>

            {/* Custom Prompt Section */}
            <div className="mb-4">
                <button 
                    onClick={() => setIsPromptSectionOpen(!isPromptSectionOpen)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left text-text-light dark:text-text-dark bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md focus:outline-none shadow-sm border border-border-light dark:border-border-dark"
                    aria-expanded={isPromptSectionOpen}
                >
                    <span className="flex items-center gap-2">
                        <SelectedPresetIcon size={16} className="text-primary dark:text-primary-light" />
                        Custom Prompt
                    </span>
                    {isPromptSectionOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <AnimatePresence>
                    {isPromptSectionOpen && (
                        <motion.div 
                            key="prompt-section-content"
                            initial={{ height: 0, opacity: 0 }} 
                            animate={{ height: 'auto', opacity: 1 }} 
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="mt-2 p-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-md shadow-inner overflow-hidden"
                        >
                            <label htmlFor="prompt-preset-select" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark mb-1">
                                Prompt Mode:
                            </label>
                            <select
                                id="prompt-preset-select"
                                value={selectedPresetId}
                                onChange={handlePresetChange}
                                className="input-field mb-2 text-xs py-1.5"
                            >
                                {PROMPT_PRESETS.map(preset => (
                                    <option key={preset.id} value={preset.id}>{preset.name}</option>
                                ))}
                            </select>
                            
                            <label htmlFor="system-prompt-area" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark mb-1">
                                System Prompt (Editable):
                            </label>
                            <textarea
                                id="system-prompt-area"
                                value={systemPrompt}
                                onChange={(e) => {
                                    setSystemPrompt(e.target.value);
                                    setSelectedPresetId('custom');
                                }}
                                rows="5"
                                className="input-field text-xs custom-scrollbar"
                                placeholder="Enter system prompt..."
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Document Management Section */}
            <div className="flex-grow flex flex-col overflow-hidden">
                 <button 
                    onClick={() => setIsDocManagementOpen(!isDocManagementOpen)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left text-text-light dark:text-text-dark bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md focus:outline-none shadow-sm border border-border-light dark:border-border-dark mb-2"
                    aria-expanded={isDocManagementOpen}
                >
                    <span className="flex items-center gap-2"><FilePlus size={16} className="text-primary dark:text-primary-light" /> Document Management</span>
                    {isDocManagementOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <AnimatePresence>
                    {isDocManagementOpen && (
                        <motion.div 
                            key="doc-management-content"
                            initial={{ height: 0, opacity: 0 }} 
                            animate={{ height: 'auto', opacity: 1 }} 
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="flex-grow flex flex-col overflow-hidden p-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-md shadow-inner"
                        >
                            <DocumentUpload onUploadSuccess={handleUploadSuccess} />
                            <div className="mt-3 flex-grow overflow-y-auto custom-scrollbar">
                                <label htmlFor="doc-filter" className="block text-xs font-medium text-text-muted-light dark:text-text-muted-dark mb-1">Filter documents:</label>
                                 <select id="doc-filter" className="input-field text-xs mt-1 mb-2 py-1.5">
                                    <option value="all">All Documents</option>
                                    <option value="pdf">PDFs</option>
                                    {/* More filter options */}
                                </select>
                                <DocumentList 
                                    key={docListKey} // To re-fetch files on upload
                                    onSelectDocument={selectDocumentForAnalysis} // Pass setter from context
                                    selectedDocument={selectedDocumentForAnalysis} // Pass current selection from context
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
export default LeftPanel;