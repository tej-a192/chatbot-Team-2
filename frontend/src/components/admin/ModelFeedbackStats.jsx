// frontend/src/components/admin/ModelFeedbackStats.jsx
import React, { useState, useEffect, useCallback } from 'react';
import * as adminApi from '../../services/adminApi.js';
import { ThumbsUp, ThumbsDown, HelpCircle, Loader2, AlertTriangle, Wrench } from 'lucide-react';
import Button from '../core/Button.jsx';

const ModelFeedbackStats = () => {
    const [stats, setStats] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await adminApi.getFeedbackStats();
            setStats(data);
        } catch (err) {
            // Handle error if needed, e.g., setError(err.message)
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    if (isLoading) return <div className="card-base p-4 text-center"><Loader2 className="animate-spin inline-block text-primary" /></div>;

    return (
        <div className="card-base p-4">
            <h2 className="text-lg font-semibold mb-3">Model Feedback & Performance</h2>
            {stats.length === 0 ? (
                <p className="text-center text-sm text-text-muted-light dark:text-text-muted-dark py-6">No feedback has been recorded yet.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {stats.map(model => (
                        <div key={model.modelId} className="card-base p-4 bg-gray-50 dark:bg-gray-800/50">
                            <h5 className="font-bold truncate" title={model.modelId}>{model.modelId}</h5>
                            <p className="text-xs text-text-muted-light dark:text-text-muted-dark">{model.totalResponses} total responses logged</p>
                            <div className="flex justify-around items-center my-4 text-center">
                                <div title="Positive Feedback"><ThumbsUp className="text-green-500 mx-auto" /><span className="font-bold text-lg">{model.feedback.positive}</span></div>
                                <div title="Negative Feedback"><ThumbsDown className="text-red-500 mx-auto" /><span className="font-bold text-lg">{model.feedback.negative}</span></div>
                                <div title="No Feedback"><HelpCircle className="text-gray-400 mx-auto" /><span className="font-bold text-lg">{model.feedback.none}</span></div>
                            </div>
                            <Button size="sm" fullWidth variant="outline" leftIcon={<Wrench size={14}/>} onClick={() => alert('The fine-tuning pipeline (Feature P2.8) is the next step!')}>
                                Fine-Tune
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ModelFeedbackStats;