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
import { renderMathInHtml } from '../../utils/markdownUtils';

marked.setOptions({
  breaks: true,
  gfm: true,
});

const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };

    console.log("createMarkup: Original Markdown:\n", markdownText);

    let html = marked.parse(markdownText);

    html = renderMathInHtml(html);

    const cleanHtml = DOMPurify.sanitize(html, { 
        ADD_TAGS: [
            'iframe', 'math', 'mtable', 'mtr', 'mtd', 'mrow', 'mi', 'mo', 'mn', 'mtext',
            'msup', 'msub', 'mfrac', 'msqrt', 'munderover', 'mstyle',
            'semantics', 'annotation', '표', 'annotation-xml',
            'span',
        ],
        ADD_ATTR: [
            'allow', 'allowfullscreen', 'frameborder', 'scrolling', 'encoding', 'style',
            'xmlns', 'display', 'class', 'role', 'aria-hidden', 'mathvariant',
            'mathsize', 'fontstyle', 'fontweight', 'color', 'background', 'href',
            'accent', 'accentunder', 'align', 'columnalign', 'columnlines',
            'columnspacing', 'columnspan', 'displaystyle', 'equalcolumns',
            'equalrows', 'fence', 'fontfamily', 'fontsize', 'frame', 'height',
            'linethickness', 'lspace', 'mathbackground', 'mathcolor',
            'maxwidth', 'minlabelspacing', 'movablelimits', 'notation', 'rowalign',
            'rowlines', 'rowspacing', 'rowspan', 'rspace', 'scriptlevel',
            'selection', 'separator', 'stretchy', 'symmetric', 'width', 'xlink:href',
        ],
    });
    return { __html: cleanHtml };
};


const escapeHtml = (unsafe) => {
    if (typeof unsafe !== 'string') return '';
    // More robust HTML escaping
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
    const [isSectionOpen, setIsSectionOpen] = useState(true); // Default to open if a doc might be pre-selected
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [analysisContent, setAnalysisContent] = useState(null);
    const [aiReasoning, setAiReasoning] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentEngagementText, setCurrentEngagementText] = useState('');

    const IconComponent = LucideIcons[iconName] || DefaultIcon;
    const modalAnalysisContentRef = useRef(null);
    const aiReasoningRef = useRef(null);

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
            // setIsSectionOpen(false); // Keep section open if desired, or close it
        } else {
            // setIsSectionOpen(true); // Keep section open if desired
            // Optionally clear previous results when a NEW document is selected,
            // but not if the same document is re-selected (depends on desired UX)
            // For now, let's assume results are tied to the selected document and don't auto-clear on re-selection here
            // Clearing happens in handleRunAnalysis before fetching new data.
        }
    }, [selectedDocumentFilename]);

    useEffect(() => {
        if (isModalOpen && analysisContent && modalAnalysisContentRef.current) {
            const timer = setTimeout(() => {
                if (modalAnalysisContentRef.current) {
                    Prism.highlightAllUnder(modalAnalysisContentRef.current);
                }
            }, 50); // Slightly increased delay for modal animations
            return () => clearTimeout(timer);
        }
    }, [isModalOpen, analysisContent]);

    useEffect(() => {
        // This effect is for the AI Reasoning <pre> block if it contains Markdown.
        // Currently, it's set up to display plain text.
        // If aiReasoning were Markdown and rendered via createMarkup:
        if (aiReasoningRef.current && aiReasoning && isDropdownOpen) {
            const codeElement = aiReasoningRef.current.querySelector('code');
            // If the code element exists and has a language class (e.g., for plain text)
            if (codeElement && codeElement.className.includes('language-')) {
                Prism.highlightElement(codeElement);
            }
            // If the entire pre block was rendered from markdown with multiple code blocks:
            // Prism.highlightAllUnder(aiReasoningRef.current);
        }
    }, [aiReasoning, isDropdownOpen]);

    const handleRunAnalysis = async () => {
        if (!selectedDocumentFilename) {
            toast.error("Please select a document first.");
            return;
        }
        setIsLoading(true);
        setError('');
        setAnalysisContent(null); // Clear previous content
        setAiReasoning(null);   // Clear previous reasoning
        setIsDropdownOpen(false);

        const payload = { filename: selectedDocumentFilename, analysis_type: toolType };
        const toastId = toast.loading(`Generating ${title} for "${selectedDocumentFilename}"...`);

        try {
            const response = await api.requestAnalysis(payload);
            toast.dismiss(toastId); // Dismiss loading toast before showing success/error

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

                if (response.thinking && response.thinking.trim() !== "") {
                    setAiReasoning(response.thinking);
                } else {
                    setAiReasoning(response.content ? "Analysis complete. No detailed reasoning provided." : "AI reasoning not available.");
                }
                setIsDropdownOpen(true); // Show dropdown with results/reasoning
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
                                        <pre
                                            ref={aiReasoningRef}
                                            className="p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-b-md text-text-light dark:text-text-dark whitespace-pre-wrap break-all text-[0.7rem] max-h-40 overflow-y-auto custom-scrollbar"
                                        >
                                            {/* For plain text reasoning. If it can contain specific code, add language-xxx class */}
                                            <code className="language-text">{escapeHtml(aiReasoning)}</code>
                                        </pre>
                                    </details>
                                )}

                                {analysisContent && toolType !== 'mindmap' && ( // Don't show view button for mindmap if it's already rendered inline
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

            {/* Modal for Displaying Full Analysis Content */}
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