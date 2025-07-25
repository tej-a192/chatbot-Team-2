// frontend/src/components/tools/OutputDisplay.jsx
import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Clock, Sparkles, Loader2 } from 'lucide-react';
import Button from '../core/Button';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const createMarkup = (markdownText) => {
    if (!markdownText) return { __html: '' };
    const rawHtml = marked.parse(markdownText);
    const cleanHtml = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
    return { __html: cleanHtml };
};


const OutputDisplay = ({ results, compilationError, code, language }) => {
    const [explanations, setExplanations] = useState({});
    const [isLoadingExplanation, setIsLoadingExplanation] = useState(null); // Tracks index

    const handleExplainError = async (index, errorMessage) => {
        setIsLoadingExplanation(index);
        try {
            const response = await api.explainError({ code, language, errorMessage });
            setExplanations(prev => ({ ...prev, [index]: response.explanation }));
        } catch (err) {
            toast.error(err.response?.data?.message || "Failed to get explanation.");
        } finally {
            setIsLoadingExplanation(null);
        }
    };

    if (compilationError) {
        return (
            <div className="p-4 bg-red-900/10 text-red-400 border-t border-red-500/30 h-full flex flex-col">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><AlertTriangle /> Compilation Error</h3>
                <pre className="flex-grow bg-red-900/20 p-4 rounded-md text-xs whitespace-pre-wrap font-mono overflow-auto custom-scrollbar">{compilationError}</pre>
            </div>
        );
    }
    
    if (!results || results.length === 0) {
        return (
            <div className="p-4 text-center text-text-muted-light dark:text-text-muted-dark border-t border-border-light dark:border-border-dark h-full flex items-center justify-center">
                <p>Run the code to see the output and test case results here.</p>
            </div>
        );
    }

    const getStatusIcon = (status) => {
        if (status === 'pass') return <CheckCircle className="text-green-500" />;
        if (status === 'fail') return <XCircle className="text-yellow-500" />;
        return <AlertTriangle className="text-red-500" />;
    };

    return (
        <div className="p-4 bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-3 flex-shrink-0">Execution Results</h3>
            <div className="flex-grow space-y-4 overflow-y-auto custom-scrollbar pr-2">
                {results.map((res, index) => (
                    <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-border-light dark:border-border-dark">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-semibold flex items-center gap-2">
                                {getStatusIcon(res.status)}
                                Test Case #{index + 1}: <span className="uppercase">{res.status}</span>
                            </h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div>
                                <strong className="block mb-1 text-text-light dark:text-text-dark">Input:</strong>
                                <pre className="bg-gray-200 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap font-mono">{res.input || '(empty)'}</pre>
                            </div>
                            <div>
                                <strong className="block mb-1 text-text-light dark:text-text-dark">Expected Output:</strong>
                                <pre className="bg-gray-200 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap font-mono">{res.expected || '(empty)'}</pre>
                            </div>
                            <div className="md:col-span-2">
                                <strong className="block mb-1 text-text-light dark:text-text-dark">Actual Output:</strong>
                                <pre className={`p-2 rounded whitespace-pre-wrap font-mono ${res.status === 'pass' ? 'bg-green-900/20' : 'bg-yellow-900/20'}`}>{res.output || '(empty)'}</pre>
                            </div>
                            {res.error && (
                                <div className="md:col-span-2">
                                    <div className="flex justify-between items-center">
                                        <strong className="block mb-1 text-red-500 dark:text-red-400">Error:</strong>
                                        {!explanations[index] && (
                                            <Button size="sm" variant="ghost" className="!text-xs" leftIcon={<Sparkles size={12}/>} onClick={() => handleExplainError(index, res.error)} isLoading={isLoadingExplanation === index}>
                                                Explain Error
                                            </Button>
                                        )}
                                    </div>
                                    <pre className="bg-red-900/20 p-2 rounded text-red-400 whitespace-pre-wrap font-mono">{res.error}</pre>
                                </div>
                            )}
                            {isLoadingExplanation === index && (
                                <div className="md:col-span-2 p-3 text-sm text-center text-text-muted-light dark:text-text-muted-dark"><Loader2 className="animate-spin inline mr-2"/>AI is explaining the error...</div>
                            )}
                            {explanations[index] && (
                                <div className="md:col-span-2 mt-2 p-3 bg-primary/10 rounded-md border border-primary/30">
                                    <h5 className="font-bold text-sm mb-1 text-primary dark:text-primary-light flex items-center gap-1.5"><Sparkles size={14}/> AI Explanation</h5>
                                    <div className="prose prose-sm dark:prose-invert max-w-none text-text-light dark:text-text-dark" dangerouslySetInnerHTML={createMarkup(explanations[index])} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default OutputDisplay;