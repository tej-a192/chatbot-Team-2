// frontend/src/components/tools/TestCaseManager.jsx
import React from 'react';
import { Plus, Trash2, ShieldQuestion } from 'lucide-react';
import Button from '../core/Button.jsx';
import IconButton from '../core/IconButton.jsx';

const TestCaseManager = ({ testCases, setTestCases, onExecute, isExecuting }) => {

    const addTestCase = () => {
        setTestCases([...testCases, { input: '', expectedOutput: '' }]);
    };

    const removeTestCase = (index) => {
        const newTestCases = testCases.filter((_, i) => i !== index);
        setTestCases(newTestCases);
    };

    const updateTestCase = (index, field, value) => {
        const newTestCases = [...testCases];
        newTestCases[index][field] = value;
        setTestCases(newTestCases);
    };

    return (
        <div className="p-4 bg-surface-light dark:bg-surface-dark border-t border-border-light dark:border-border-dark">
            <h3 className="text-lg font-semibold mb-3">Test Cases</h3>
            <div className="space-y-4 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                {testCases.map((tc, index) => (
                    <div key={index} className="flex flex-col md:flex-row gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-border-light dark:border-border-dark">
                        <div className="flex-1">
                            <label className="text-xs font-medium text-text-muted-light dark:text-text-muted-dark">Input (stdin)</label>
                            <textarea
                                value={tc.input}
                                onChange={(e) => updateTestCase(index, 'input', e.target.value)}
                                className="input-field mt-1 !text-xs font-mono"
                                rows="2"
                                placeholder="Enter input, separate lines with \n"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs font-medium text-text-muted-light dark:text-text-muted-dark">Expected Output (stdout)</label>
                            <textarea
                                value={tc.expectedOutput}
                                onChange={(e) => updateTestCase(index, 'expectedOutput', e.target.value)}
                                className="input-field mt-1 !text-xs font-mono"
                                rows="2"
                                placeholder="Enter expected exact output"
                            />
                        </div>
                        <div className="flex items-end">
                            <IconButton icon={Trash2} variant="danger" size="sm" onClick={() => removeTestCase(index)} title="Remove Test Case" />
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-between mt-4">
                <div className="space-x-2">
                    <Button onClick={addTestCase} size="sm" variant="outline" leftIcon={<Plus size={14}/>}>
                        Add Test Case
                    </Button>
                    <Button size="sm" variant="outline" leftIcon={<ShieldQuestion size={14} />} disabled>
                        AI Generate Cases (soon)
                    </Button>
                </div>
                <Button onClick={onExecute} size="md" isLoading={isExecuting}>
                    Run Code & Evaluate
                </Button>
            </div>
        </div>
    );
};

export default TestCaseManager;