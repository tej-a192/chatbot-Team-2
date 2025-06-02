// src/components/analysis/AnalysisToolRunner.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api.js';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Loader2, Eye, AlertTriangle, Sparkles, HelpCircle as DefaultIcon, Download } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import Button from '../core/Button.jsx';
import IconButton from '../core/IconButton.jsx';
import Modal from '../core/Modal.jsx';
import { marked } from 'marked';
import MindmapViewer from './MindmapViewer.jsx'; 
import DOMPurify from 'dompurify';
import Prism from 'prismjs'; 
import { renderMathInHtml } from '../../utils/markdownUtils';
import { useAppState } from '../../contexts/AppStateContext.jsx'; 

marked.setOptions({
  breaks: true,
  gfm: true,
});

const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };
    let html = marked.parse(markdownText);
    html = renderMathInHtml(html); 
    const cleanHtml = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true, mathMl: true, svg: true }, 
        ADD_TAGS: ['iframe'], 
        ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'],
    });
    return { __html: cleanHtml };
};

const escapeHtml = (unsafe) => {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, '"').replace(/'/g, "'");
};

const ENGAGEMENT_TEXTS = {
    faq: ["Analyzing FAQs...", "Identifying questions...", "Compiling answers..."],
    topics: ["Extracting topics...", "Identifying themes...", "Summarizing points..."],
    mindmap: ["Generating mind map...", "Structuring concepts...", "Visualizing..."],
    default: ["Processing...", "Thinking...", "Working on it..."]
};

// Placeholder messages to check against for AI Reasoning section
const placeholderReasoningMessages = [
    "Retrieved stored analysis. No detailed AI reasoning provided.",
    "AI reasoning not available.",
    "Mock generation for",
    "Retrieved stored mindmap data. No specific thinking process recorded in content."
];

function AnalysisToolRunner({ toolType, title, iconName, selectedDocumentFilename }) {
    const [isSectionOpen, setIsSectionOpen] = useState(true);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [analysisContent, setAnalysisContent] = useState(null);
    const [aiReasoning, setAiReasoning] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentEngagementText, setCurrentEngagementText] = useState('');

    const IconComponent = LucideIcons[iconName] || DefaultIcon;
    const modalAnalysisContentRef = useRef(null);
    const aiReasoningContentRef = useRef(null);
    const mindmapViewerRef = useRef(null); 
    const { theme: appTheme } = useAppState(); 

    useEffect(() => {
        let intervalId;
        if (isLoading) {
            const texts = ENGAGEMENT_TEXTS[toolType] || ENGAGEMENT_TEXTS.default;
            let textIndex = 0;
            setCurrentEngagementText(texts[0]);
            intervalId = setInterval(() => {
                textIndex = (textIndex + 1) % texts.length;
                setCurrentEngagementText(texts[textIndex]);
            }, 1800);
        } else {
            setCurrentEngagementText('');
        }
        return () => clearInterval(intervalId);
    }, [isLoading, toolType]);

    useEffect(() => {
        if (!selectedDocumentFilename) {
            setIsLoading(false);
            setError('');
            setAnalysisContent(null);
            setAiReasoning(null);
            setIsDropdownOpen(false);
        } else {
            // When a new document is selected, optionally reset previous results
            // to avoid showing old data before a new "Run"
             setAnalysisContent(null);
             setAiReasoning(null);
             setIsDropdownOpen(false);
             setError('');
             setIsLoading(false); // Ensure loading state is reset
        }
    }, [selectedDocumentFilename]);

    useEffect(() => {
        if (isModalOpen && analysisContent && toolType !== 'mindmap' && modalAnalysisContentRef.current) {
            const timer = setTimeout(() => {
                if (modalAnalysisContentRef.current) Prism.highlightAllUnder(modalAnalysisContentRef.current);
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isModalOpen, analysisContent, toolType]);

    useEffect(() => {
        if (aiReasoningContentRef.current && aiReasoning && isDropdownOpen) {
            const timer = setTimeout(() => {
                if (aiReasoningContentRef.current) Prism.highlightAllUnder(aiReasoningContentRef.current);
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [aiReasoning, isDropdownOpen]);

    const handleRunAnalysis = async () => {
        if (!selectedDocumentFilename) {
            toast.error("Please select a document first.");
            return;
        }
        setIsLoading(true);
        setError('');
        setAnalysisContent(null);
        setAiReasoning(null);
        setIsDropdownOpen(false);

        const payload = { filename: selectedDocumentFilename, analysis_type: toolType };
        const toastId = toast.loading(`Generating ${title} for "${selectedDocumentFilename}"...`);

        try {
            const response = await api.requestAnalysis(payload);
            toast.dismiss(toastId);

            if (response) {
                if (response.content && response.content.trim() !== "" && !response.content.startsWith("Error:")) {
                    setAnalysisContent(response.content);
                    toast.success(`${title} analysis complete! Click 'View Full ${title}' to see details.`);
                } else if (response.content && response.content.startsWith("Error:")) {
                    setError(response.content);
                    toast.error(`Error in ${title}: ${response.content.substring(0, 100)}...`);
                } else {
                    setError(`No content returned for ${title}.`);
                    toast.warn(`No content was generated for ${title}.`);
                }

                if (response.thinking && response.thinking.trim() !== "") {
                    setAiReasoning(response.thinking);
                } else {
                    setAiReasoning(response.content ? "Retrieved stored analysis. No detailed AI reasoning provided." : "AI reasoning not available.");
                }
                setIsDropdownOpen(true);
            } else {
                throw new Error("Empty response from analysis service.");
            }
        } catch (err) {
            toast.dismiss(toastId);
            const errorMessage = err.message || `Failed to generate or fetch ${title}.`;
            setError(errorMessage);
            toast.error(errorMessage);
            console.error(`Run ${title} Analysis Error:`, err);
            setIsDropdownOpen(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadMindmap = async (format = 'svg') => {
        if (mindmapViewerRef.current && mindmapViewerRef.current.getSvgElement) {
            const svgElement = mindmapViewerRef.current.getSvgElement();
            if (!svgElement) {
                toast.error("Mindmap SVG element not found or not rendered yet.");
                return;
            }

            const filenameBase = selectedDocumentFilename ? selectedDocumentFilename.split('.')[0] : 'mindmap';
            const filename = `${filenameBase}_${toolType}.${format}`;

            if (format === 'svg') {
                const serializer = new XMLSerializer();
                let svgString = serializer.serializeToString(svgElement);
                svgString = '<?xml version="1.0" standalone="no"?>\r\n' + svgString;
                const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                toast.success("SVG downloaded!");
            } else if (format === 'png') {
                const pngToastId = toast.loading("Preparing PNG download...");
                try {
                    // Ensure save-svg-as-png is available (e.g., npm install save-svg-as-png)
                    // If it's not working, common issues include:
                    // 1. Library not installed/imported correctly.
                    // 2. Complex SVG features (e.g., foreignObject, certain CSS filters) that the library doesn't support.
                    // 3. Browser security restrictions if the SVG contains external resources (unlikely for Mermaid).
                    // 4. Very large SVGs causing memory issues.
                    const { saveSvgAsPng } = await import('save-svg-as-png');
                    if (saveSvgAsPng) {
                        saveSvgAsPng(svgElement, filename, { 
                            scale: 2, 
                            backgroundColor: appTheme === 'dark' ? '#1E293B' : '#FFFFFF' 
                        });
                        toast.success("PNG download started!", { id: pngToastId });
                    } else {
                        throw new Error("saveSvgAsPng function not found after import.");
                    }
                } catch (e) {
                    console.error("Error loading/using save-svg-as-png:", e);
                    toast.error(`Failed to export PNG: ${e.message}. SVG export is available. Consider checking console for details if library is missing.`, { id: pngToastId });
                }
            }
        } else {
            toast.error("Mindmap viewer component not ready or SVG not available.");
        }
    };
    
    const renderModalContent = () => {
        if (isLoading && !analysisContent) {
            return (
                <div className="flex items-center justify-center h-48">
                    <Loader2 size={32} className="animate-spin text-primary" />
                    <p className="ml-2 text-text-muted-light dark:text-text-muted-dark">Loading analysis...</p>
                </div>
            );
        }
        if (error && !analysisContent) {
             return <p className="p-4 text-center text-red-500 dark:text-red-400">{error}</p>;
        }
        if (!analysisContent) {
            return <p className="p-4 text-center text-text-muted-light dark:text-text-muted-dark">No analysis content available to display.</p>;
        }

        if (toolType === 'mindmap') {
            return (
                <div className="mindmap-modal-content-wrapper min-h-[60vh] h-[calc(70vh-80px)] flex justify-center items-center">
                     <MindmapViewer mermaidCode={analysisContent} ref={mindmapViewerRef} />
                </div>
            );
        }
        return (
            <div
                ref={modalAnalysisContentRef}
                className="prose prose-sm dark:prose-invert max-w-none text-text-light dark:text-text-dark p-1 custom-scrollbar text-[0.8rem] leading-relaxed"
                dangerouslySetInnerHTML={createMarkup(analysisContent)}
            />
        );
    };

    // Determine if AI reasoning is substantial or just a placeholder
    const showReasoning = aiReasoning && !placeholderReasoningMessages.some(msg => aiReasoning.includes(msg));

    return (
        <div className="card-base p-3">
            <div className="flex items-center justify-between">
                <div
                    className="flex items-center gap-2 text-sm font-medium text-text-light dark:text-text-dark focus:outline-none w-full text-left cursor-pointer hover:text-primary dark:hover:text-primary-light transition-colors"
                    onClick={() => setIsSectionOpen(!isSectionOpen)}
                    aria-expanded={isSectionOpen}
                >
                    <IconComponent size={16} className="text-primary dark:text-primary-light flex-shrink-0" />
                    <span className="flex-grow">{title}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                        onClick={handleRunAnalysis}
                        variant="primary"
                        size="sm"
                        className="!px-3 !py-1 text-xs"
                        isLoading={isLoading}
                        disabled={!selectedDocumentFilename || isLoading}
                        title={!selectedDocumentFilename ? "Select a document first" : `Run ${title} Analysis`}
                    >
                       {isLoading ? (currentEngagementText.split(' ')[0] || "...") : "Run"}
                    </Button>
                    <IconButton
                        icon={isSectionOpen ? ChevronUp : ChevronDown}
                        onClick={() => setIsSectionOpen(!isSectionOpen)}
                        size="sm"
                        variant="ghost"
                        className="p-1"
                        aria-label={isSectionOpen ? "Collapse section" : "Expand section"}
                        disabled={isLoading && isSectionOpen}
                    />
                </div>
            </div>

            <AnimatePresence>
                {isSectionOpen && (
                    <motion.div
                        key="tool-section-content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="mt-2 pt-2 border-t border-border-light dark:border-border-dark overflow-hidden"
                    >
                        {isLoading && (
                            <div className="text-xs text-text-muted-light dark:text-text-muted-dark p-2 flex items-center justify-center gap-2 animate-fadeIn">
                                <Loader2 size={14} className="animate-spin"/> {currentEngagementText}
                            </div>
                        )}

                        {error && !isLoading && (
                            <div className="my-2 p-2 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-300 rounded-md text-xs flex items-center gap-1">
                                <AlertTriangle size={14} /> {error.length > 150 ? error.substring(0,147) + "..." : error}
                            </div>
                        )}

                        {!isLoading && !error && (analysisContent || aiReasoning) && isDropdownOpen && (
                            <motion.div
                                key="analysis-dropdown"
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.2 }}
                                className="mt-2 space-y-2"
                            >
                                {showReasoning && aiReasoning && ( // Conditionally render based on showReasoning
                                    <details className="group text-xs rounded-md border border-border-light dark:border-border-dark bg-surface-light dark:bg-gray-800 shadow-sm">
                                        <summary className="flex items-center justify-between gap-1 p-2 cursor-pointer text-text-muted-light dark:text-text-muted-dark hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-t-md">
                                            <span className="flex items-center gap-1.5 font-medium">
                                                <Sparkles size={14} className="text-accent" /> AI Reasoning
                                            </span>
                                            <ChevronDown size={16} className="group-open:rotate-180 transition-transform" />
                                        </summary>
                                        <div
                                            ref={aiReasoningContentRef}
                                            className="p-2.5 prose prose-xs dark:prose-invert max-w-none text-text-light dark:text-text-dark max-h-60 overflow-y-auto custom-scrollbar text-[0.75rem] leading-relaxed bg-gray-50 dark:bg-gray-900/50 rounded-b-md"
                                            dangerouslySetInnerHTML={createMarkup(aiReasoning)}
                                        />
                                    </details>
                                )}

                                {analysisContent && ( 
                                     <Button
                                        onClick={() => setIsModalOpen(true)}
                                        variant="outline" 
                                        size="sm"
                                        fullWidth
                                        leftIcon={<Eye size={14}/>}
                                        className="!py-1.5 text-xs border-primary/70 text-primary hover:bg-primary/10 dark:border-primary-light/70 dark:text-primary-light dark:hover:bg-primary-light/10"
                                    >
                                       View Full {title}
                                    </Button>
                                )}
                            </motion.div>
                        )}
                        
                        {!isLoading && !isDropdownOpen && !error && (
                            <p className="text-xs text-text-muted-light dark:text-text-muted-dark p-2 text-center">
                                {selectedDocumentFilename ? `Click "Run" to generate ${title} for "${selectedDocumentFilename}".` : "Select a document to enable analysis."}
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={`${title} for "${selectedDocumentFilename || 'document'}"`}
                size={toolType === 'mindmap' ? "3xl" : "xl"}
                footerContent={
                    <>
                        {toolType === 'mindmap' && analysisContent && (
                            <>
                                <Button onClick={() => handleDownloadMindmap('svg')} variant="outline" size="sm" className="text-xs" leftIcon={<Download size={14}/>}>SVG</Button>
                                {/* <Button onClick={() => handleDownloadMindmap('png')} variant="outline" size="sm" className="text-xs" leftIcon={<Download size={14}/>}>PNG</Button> */}
                                <div className="flex-grow"></div> {/* Spacer */}
                            </>
                        )}
                        <Button onClick={() => setIsModalOpen(false)} variant="secondary" size="sm" className="text-xs">Close</Button>
                    </>
                }
            >
                <div className={`max-h-[70vh] overflow-y-auto custom-scrollbar p-1 pr-2 rounded-md shadow-inner ${toolType === 'mindmap' ? 'bg-transparent dark:bg-transparent' : 'bg-gray-50 dark:bg-gray-800'}`}>
                    {selectedDocumentFilename && (
                        <p className="text-xs text-text-muted-light dark:text-text-muted-dark mb-2 border-b border-border-light dark:border-border-dark pb-1.5">
                            Source Document: <strong>{selectedDocumentFilename}</strong>
                        </p>
                    )}
                    {renderModalContent()}
                </div>
            </Modal>
        </div>
    );
}
export default AnalysisToolRunner;