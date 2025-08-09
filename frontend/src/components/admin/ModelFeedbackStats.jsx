// frontend/src/components/admin/ModelFeedbackStats.jsx
import React, { useState, useEffect, useCallback } from 'react';
// --- START MODIFICATION: Import startFineTuningJob ---
import * as adminApi from '../../services/adminApi.js';
// --- END MODIFICATION ---
import { ThumbsUp, ThumbsDown, HelpCircle, Loader2, AlertTriangle, Wrench } from 'lucide-react';
import Button from '../core/Button.jsx';
// --- START MODIFICATION: Import toast ---
import toast from 'react-hot-toast';
// --- END MODIFICATION ---


const ModelFeedbackStats = () => {
    const [stats, setStats] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    // --- START MODIFICATION: Add fine-tuning loading state ---
    const [isFineTuning, setIsFineTuning] = useState(false);
    // --- END MODIFICATION ---


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

    // --- START MODIFICATION: Add handler for fine-tuning ---
    const handleStartFineTuning = async (modelId) => {
        if (!window.confirm(`Are you sure you want to start a fine-tuning job for the model tagged as '${modelId}'? This will use all positive feedback data.`)) {
            return;
        }
        setIsFineTuning(true);
        const toastId = toast.loading(`Starting fine-tuning job for ${modelId}...`);
        try {
            const response = await adminApi.startFineTuningJob({
                modelIdToUpdate: 'ollama/ai-tutor-custom:latest' // Hardcoded as per the requirement
            });
            toast.success(response.message || 'Fine-tuning job successfully started.', { id: toastId, duration: 5000 });
        } catch (error) {
            toast.error(error.message || 'Failed to start fine-tuning job.', { id: toastId });
        } finally {
            setIsFineTuning(false);
        }
    };
    // --- END MODIFICATION ---


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
                            {/* --- START MODIFICATION: Update Button functionality --- */}
                            <Button 
                                size="sm" 
                                fullWidth 
                                variant="outline" 
                                leftIcon={<Wrench size={14}/>} 
                                onClick={() => handleStartFineTuning(model.modelId)}
                                isLoading={isFineTuning}
                                disabled={isFineTuning || model.feedback.positive < 10} // Example: disable if less than 10 positive feedbacks
                                title={model.feedback.positive < 10 ? "Need at least 10 positive feedbacks to start a job." : "Start fine-tuning job"}
                            >
                                Fine-Tune
                            </Button>
                            {/* --- END MODIFICATION --- */}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ModelFeedbackStats;