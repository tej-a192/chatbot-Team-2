// frontend/src/components/tools/OutputDisplay.jsx
import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react';

const OutputDisplay = ({ results, compilationError }) => {
    if (compilationError) {
        return (
            <div className="p-4 bg-red-900/10 text-red-400 border-t border-red-500/30">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2"><AlertTriangle /> Compilation Error</h3>
                <pre className="bg-red-900/20 p-4 rounded-md text-xs whitespace-pre-wrap font-mono">{compilationError}</pre>
            </div>
        );
    }
    
    if (!results || results.length === 0) {
        return (
            <div className="p-4 text-center text-text-muted-light dark:text-text-muted-dark border-t border-border-light dark:border-border-dark">
                <p>Run the code to see the output and test case results here.</p>
            </div>
        );
    }

    const getStatusIcon = (status) => {
        if (status === 'pass') return <CheckCircle className="text-green-500" />;
        if (status === 'fail') return <XCircle className="text-yellow-500" />;
        return <AlertTriangle className="text-red-500" />; // error
    };

    return (
        <div className="p-4 bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark">
            <h3 className="text-lg font-semibold mb-3">Execution Results</h3>
            <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                {results.map((res, index) => (
                    <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-border-light dark:border-border-dark">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-semibold flex items-center gap-2">
                                {getStatusIcon(res.status)}
                                Test Case #{index + 1}: <span className="uppercase">{res.status}</span>
                            </h4>
                            {res.duration && <span className="text-xs text-text-muted-light dark:text-text-muted-dark flex items-center gap-1"><Clock size={12}/>{res.duration}ms</span>}
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
                                    <strong className="block mb-1 text-red-500 dark:text-red-400">Error:</strong>
                                    <pre className="bg-red-900/20 p-2 rounded text-red-400 whitespace-pre-wrap font-mono">{res.error}</pre>
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