// frontend/src/components/tools/AIAssistantPanel.jsx
import React from 'react';
import { Bot } from 'lucide-react';
import Button from '../core/Button.jsx';

const AIAssistantPanel = () => {
    return (
        <div className="p-4 h-full flex flex-col bg-surface-light dark:bg-surface-dark border-l border-border-light dark:border-border-dark">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Bot className="text-primary"/>
                AI Assistant
            </h3>
            <div className="flex-grow bg-gray-50 dark:bg-gray-800/50 rounded-md p-3 text-sm text-text-muted-light dark:text-text-muted-dark border border-dashed border-border-light dark:border-border-dark flex flex-col justify-center items-center">
                <p className="text-center mb-4">AI-powered code analysis and suggestions will appear here.</p>
                <Button variant="outline" size="sm" disabled>Analyze Code (soon)</Button>
            </div>
        </div>
    );
};

export default AIAssistantPanel;