// src/components/analysis/AnalysisToolRunner.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api.js';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Loader2, Eye, AlertTriangle, Sparkles, HelpCircle as DefaultIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import Button from '../core/Button.jsx';
import IconButton from '../core/IconButton.jsx';
import Modal from '../core/Modal.jsx';
import { marked } from 'marked';
import MindmapViewer from './MindmapViewer.jsx';
import DOMPurify from 'dompurify';
import Prism from 'prismjs'; // Ensure Prism is imported or available globally
import { renderMathInHtml } from '../../utils/markdownUtils'; // Assuming you have this

// marked options and createMarkup should be defined once.
// If createMarkup is identical to the one in MessageBubble, consider moving it to markdownUtils.js
marked.setOptions({
  breaks: true,
  gfm: true,
});

// This createMarkup function should be robust for Markdown, KaTeX, and then sanitization.
const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };
    // console.log("[ATR] createMarkup: Original Markdown:\n", markdownText); // For debugging

    let html = marked.parse(markdownText);
    // console.log("[ATR] createMarkup: HTML after marked.parse():\n", html); // For debugging

    html = renderMathInHtml(html); // Process KaTeX
    // console.log("[ATR] createMarkup: HTML after renderMathInHtml():\n", html); // For debugging

    const cleanHtml = DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true, mathMl: true, svg: true }, // Recommended for KaTeX
        ADD_TAGS: ['iframe'], // For any other specific tags you need
        ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling'], // For iframes
    });
    // console.log("[ATR] createMarkup: HTML after DOMPurify.sanitize():\n", cleanHtml); // For debugging
    return { __html: cleanHtml };
};


// escapeHtml is used if you ever display raw content that shouldn't be interpreted as HTML
const escapeHtml = (unsafe) => {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, `"`)
        .replace(/'/g, "'");
};

const ENGAGEMENT_TEXTS = {
    faq: ["Analyzing FAQs...", "Identifying questions...", "Compiling answers..."],
    topics: ["Extracting topics...", "Identifying themes...", "Summarizing points..."],
    mindmap: ["Generating mind map...", "Structuring concepts...", "Visualizing..."],
    default: ["Processing...", "Thinking...", "Working on it..."]
};

function AnalysisToolRunner({ toolType, title, iconName, selectedDocumentFilename }) {
    const [isSectionOpen, setIsSectionOpen] = useState(true);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [analysisContent, setAnalysisContent] = useState(null);
    const [aiReasoning, setAiReasoning] = useState(null); // This will be Markdown
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentEngagementText, setCurrentEngagementText] = useState('');

    const IconComponent = LucideIcons[iconName] || DefaultIcon;
    const modalAnalysisContentRef = useRef(null);
    const aiReasoningContentRef = useRef(null); // Ref for the AI reasoning content div

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
            // Resetting when no document is selected
            setIsLoading(false);
            setError('');
            setAnalysisContent(null);
            setAiReasoning(null);
            setIsDropdownOpen(false);
        }
        // No need to explicitly set isSectionOpen here, it's user-controlled
    }, [selectedDocumentFilename]);

    // useEffect for modal content Prism highlighting
    useEffect(() => {
        if (isModalOpen && analysisContent && modalAnalysisContentRef.current) {
            const timer = setTimeout(() => {
                if (modalAnalysisContentRef.current) {
                    Prism.highlightAllUnder(modalAnalysisContentRef.current);
                }
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isModalOpen, analysisContent]);

    // useEffect for AI Reasoning content Prism highlighting
    useEffect(() => {
        if (aiReasoningContentRef.current && aiReasoning && isDropdownOpen) {
            // aiReasoning is now Markdown, so Prism.highlightAllUnder will scan its rendered HTML
            const timer = setTimeout(() => {
                if (aiReasoningContentRef.current) {
                    Prism.highlightAllUnder(aiReasoningContentRef.current);
                }
            }, 0); // Can be 0ms, Prism will execute after current JS stack
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
                    toast.success(`${title} analysis complete!`);
                } else if (response.content && response.content.startsWith("Error:")) {
                    setError(response.content);
                    toast.error(`Error in ${title}: ${response.content.substring(0, 100)}...`);
                } else {
                    setError(`No content returned for ${title}.`);
                    toast.warn(`No content was generated for ${title}.`);
                }

                // Assuming response.thinking is now also Markdown
                if (response.thinking && response.thinking.trim() !== "") {
                    setAiReasoning(response.thinking);
                } else {
                    setAiReasoning(response.content ? "*Analysis complete. No detailed reasoning provided by AI.*" : "*AI reasoning not available.*");
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

    const renderModalContent = () => {
        if (!analysisContent) return <p className="p-4 text-center text-text-muted-light dark:text-text-muted-dark">No analysis content available to display.</p>;
        if (toolType === 'mindmap') {
            return <MindmapViewer markdownContent={analysisContent} />;
        }
        return (
            <div
                ref={modalAnalysisContentRef}
                className="prose prose-sm dark:prose-invert max-w-none text-text-light dark:text-text-dark p-1 custom-scrollbar text-[0.8rem] leading-relaxed"
                dangerouslySetInnerHTML={createMarkup(analysisContent)}
            />
        );
    };

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
                                {aiReasoning && (
                                    <details className="group text-xs rounded-md border border-border-light dark:border-border-dark bg-surface-light dark:bg-gray-800 shadow-sm">
                                        <summary className="flex items-center justify-between gap-1 p-2 cursor-pointer text-text-muted-light dark:text-text-muted-dark hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors rounded-t-md">
                                            <span className="flex items-center gap-1.5 font-medium">
                                                <Sparkles size={14} className="text-accent" /> AI Reasoning
                                            </span>
                                            <ChevronDown size={16} className="group-open:rotate-180 transition-transform" />
                                        </summary>
                                        {/* MODIFIED AI REASONING RENDERING */}
                                        <div
                                            ref={aiReasoningContentRef}
                                            className="p-2.5 prose prose-xs dark:prose-invert max-w-none text-text-light dark:text-text-dark max-h-60 overflow-y-auto custom-scrollbar text-[0.75rem] leading-relaxed bg-gray-50 dark:bg-gray-900/50 rounded-b-md"
                                            dangerouslySetInnerHTML={createMarkup(aiReasoning)}
                                        />
                                    </details>
                                )}

                                {analysisContent && toolType !== 'mindmap' && (
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
                title={`Result for ${title} on "${selectedDocumentFilename || 'document'}"`}
                size="xl"
            >
                <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-1 pr-2 bg-gray-50 dark:bg-gray-800 rounded-md shadow-inner">
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