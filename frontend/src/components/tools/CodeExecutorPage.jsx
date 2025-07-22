// frontend/src/components/tools/CodeExecutorPage.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import CodeEditor from './CodeEditor';
import TestCaseManager from './TestCaseManager';
import OutputDisplay from './OutputDisplay';
import AIAssistantPanel from './AIAssistantPanel';
import api from '../../services/api';
import toast from 'react-hot-toast';

const CodeExecutorPage = () => {
    const [language, setLanguage] = useState('python');
    const [code, setCode] = useState('# Welcome to the Code Executor!\n# Write your Python code here.\n\ndef main():\n    # Example: Read two numbers and print their sum\n    try:\n        a = int(input())\n        b = int(input())\n        print(a + b)\n    except (ValueError, EOFError):\n        print("Invalid input. Please provide two integers on separate lines.")\n\nif __name__ == "__main__":\n    main()\n');
    const [testCases, setTestCases] = useState([
        { input: '5\n10', expectedOutput: '15' },
        { input: '1\n-1', expectedOutput: '0' }
    ]);
    const [results, setResults] = useState([]);
    const [compilationError, setCompilationError] = useState(null);
    const [isExecuting, setIsExecuting] = useState(false);

    const handleExecute = async () => {
        setIsExecuting(true);
        setResults([]);
        setCompilationError(null);
        const toastId = toast.loading('Executing code...');

        try {
            const response = await api.executeCode({
                language,
                code,
                testCases
            });
            
            setResults(response.results);
            const failures = response.results.filter(r => r.status !== 'pass').length;
            if (failures > 0) {
                 toast.error(`${failures} test case(s) failed or had errors.`, { id: toastId });
            } else {
                 toast.success('All test cases passed!', { id: toastId });
            }

        } catch (error) {
            const errorMessage = error.response?.data?.message || "An unknown error occurred.";
            setCompilationError(errorMessage);
            toast.error(errorMessage, { id: toastId });
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark font-sans">
            <header className="flex-shrink-0 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark h-16 flex items-center justify-between px-6">
                <h1 className="text-xl font-bold">Secure Code Executor</h1>
                <Link to="/" className="flex items-center gap-2 text-sm btn btn-ghost">
                    <Home size={16}/>
                    Back to Main App
                </Link>
            </header>
            <div className="flex flex-1 overflow-hidden">
                <main className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-grow p-4 h-1/2">
                       <CodeEditor code={code} setCode={setCode} language={language} />
                    </div>
                    <div className="flex-shrink-0 border-t border-border-light dark:border-border-dark h-1/2 overflow-y-auto">
                        <OutputDisplay results={results} compilationError={compilationError} />
                    </div>
                </main>
                <aside className="w-[500px] flex-shrink-0 flex flex-col border-l border-border-light dark:border-border-dark overflow-y-auto">
                     <div className="flex-shrink-0 h-2/3">
                        <TestCaseManager 
                            testCases={testCases} 
                            setTestCases={setTestCases}
                            onExecute={handleExecute}
                            isExecuting={isExecuting}
                            code={code}
                            language={language}
                        />
                     </div>
                     <div className="flex-grow h-1/3">
                        <AIAssistantPanel 
                            code={code}
                            language={language}
                        />
                     </div>
                </aside>
            </div>
        </div>
    );
};

export default CodeExecutorPage;