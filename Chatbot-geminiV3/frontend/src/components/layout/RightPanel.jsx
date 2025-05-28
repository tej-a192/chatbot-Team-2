// import React, { useState } from 'react';
// import AnalysisTool from '../analysis/AnalysisTool';
// import { ChevronDown, ChevronUp, Telescope } from 'lucide-react'; // Example icons

// function RightPanel() {
//     const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(true);
//     // TODO: Manage state for selected document for analysis, analysis results for each tool

//     return (
//         <div className="flex flex-col h-full">
//             <button 
//                 onClick={() => setIsAnalyzerOpen(!isAnalyzerOpen)}
//                 className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-left text-text-light dark:text-text-dark bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md focus:outline-none mb-2"
//             >
//                 <span><Telescope size={16} className="inline mr-2" /> Advanced Analyzer</span>
//                 {isAnalyzerOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
//             </button>

//             {isAnalyzerOpen && (
//                 <div className="flex-grow space-y-3 overflow-y-auto animate-fadeIn p-1">
//                     {/* 
//                         Here you'd pass the selected document from LeftPanel (or a global context) 
//                         to each AnalysisTool instance. This requires more state management.
//                         For simplicity, AnalysisTool will internally manage its state for now.
//                     */}
//                     <AnalysisTool toolType="faq" title="FAQ Generator" icon="HelpCircle" />
//                     <AnalysisTool toolType="topics" title="Key Topics Extractor" icon="Tags" />
//                     <AnalysisTool toolType="mindmap" title="Mind Map Creator" icon="GitFork" />
//                 </div>
//             )}
//         </div>
//     );
// }
// export default RightPanel;












// frontend/src/components/layout/RightPanel.jsx
import React, { useState } from 'react';
import { useAppState } from '../../contexts/AppStateContext';
import AnalysisTool from '../analysis/AnalysisTool.jsx'; // Added .jsx
import { PanelRightClose, ChevronDown, ChevronUp, Telescope } from 'lucide-react';
import IconButton from '../core/IconButton.jsx'; // Added .jsx
import { motion } from 'framer-motion';

function RightPanel() {
    const { setIsRightPanelOpen, selectedDocumentForAnalysis } = useAppState();
    const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(true);

    const currentSelectedDocFilename = selectedDocumentForAnalysis?.originalName || null;

    return (
        <div className="flex flex-col h-full p-3 sm:p-4 bg-surface-light dark:bg-surface-dark text-text-light dark:text-text-dark custom-scrollbar">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border-light dark:border-border-dark">
                <h2 className="text-base font-semibold">Advanced Analyzer</h2>
                <IconButton 
                    icon={PanelRightClose} 
                    onClick={() => setIsRightPanelOpen(false)} 
                    title="Close Analyzer Panel"
                    variant="ghost"
                    size="sm"
                    className="text-text-muted-light dark:text-text-muted-dark hover:text-primary dark:hover:text-primary-light"
                />
            </div>
            
            <button 
                onClick={() => setIsAnalyzerOpen(!isAnalyzerOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md focus:outline-none shadow-sm border border-border-light dark:border-border-dark mb-3"
            >
                <span className="flex items-center gap-2"><Telescope size={16} /> Analysis Tools</span>
                {isAnalyzerOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {isAnalyzerOpen && (
                <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="flex-grow space-y-3 overflow-y-auto custom-scrollbar pr-1"
                >
                    {!currentSelectedDocFilename && (
                        <div className="p-4 text-xs text-center text-text-muted-light dark:text-text-muted-dark bg-gray-50 dark:bg-gray-800 rounded-md border border-dashed border-border-light dark:border-border-dark">
                            <p>Select a document from the left panel to enable analysis tools.</p>
                        </div>
                    )}
                    <AnalysisTool toolType="faq" title="FAQ Generator" iconName="HelpCircle" selectedDocumentFilename={currentSelectedDocFilename} />
                    <AnalysisTool toolType="topics" title="Key Topics Extractor" iconName="Tags" selectedDocumentFilename={currentSelectedDocFilename} />
                    <AnalysisTool toolType="mindmap" title="Mind Map Creator" iconName="GitFork" selectedDocumentFilename={currentSelectedDocFilename} />
                </motion.div>
            )}
        </div>
    );
}
export default RightPanel;