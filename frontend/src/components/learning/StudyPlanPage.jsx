// frontend/src/components/learning/StudyPlanPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, Plus, Loader2, AlertTriangle, CheckCircle, Lock, Circle, GraduationCap, FileText, Globe, Code, BookMarked } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import Button from '../core/Button';
import { motion, AnimatePresence } from 'framer-motion';

const iconMap = {
    direct_answer: GraduationCap,
    document_review: FileText,
    web_search: Globe,
    academic_search: BookMarked,
    code_executor: Code,
};

// --- Module Checklist Item Component ---
const ModuleItem = ({ module, pathId, onModuleUpdate, isNextUp, handleNewChat }) => {
    const navigate = useNavigate();
    const [isUpdating, setIsUpdating] = useState(false);

    const handleStatusToggle = async () => {
        setIsUpdating(true);
        const newStatus = module.status === 'completed' ? 'not_started' : 'completed';
        try {
            await api.updateModuleStatus(pathId, module.moduleId, newStatus);
            toast.success(`Module '${module.title}' marked as ${newStatus}.`);
            onModuleUpdate(); // Trigger parent to refetch all paths
        } catch (error) {
            toast.error(`Failed to update module: ${error.message}`);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleStartModule = () => {
        const { activity } = module;

        if (activity.type === 'code_executor') {
            navigate('/tools/code-executor');
            return;
        }

        // Call the handleNewChat function. When it's finished and has the new session ID,
        // it will execute our callback.
        handleNewChat((newSessionId) => {
            // This code runs *after* a new session is successfully created.
            console.log(`New session ${newSessionId} created. Navigating with module context.`);
            navigate('/', { 
                state: { 
                    prefilledPrompt: activity.suggestedPrompt,
                    startModuleActivity: activity // Pass the entire activity object
                } 
            });
        });
    };

    const ActivityIcon = iconMap[module.activity.type] || GraduationCap;
    const isLocked = module.status === 'locked';
    const isCompleted = module.status === 'completed';

    return (
        <div className={`flex items-start gap-4 p-4 border-l-4 ${isCompleted ? 'border-green-500 bg-green-500/5' : isNextUp ? 'border-primary' : 'border-transparent'}`}>
            <div className="flex-shrink-0 mt-1">
                {isUpdating ? (
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                ) : (
                    <button onClick={handleStatusToggle} disabled={isLocked} className="disabled:opacity-50 disabled:cursor-not-allowed">
                        {isLocked ? <Lock className="w-6 h-6 text-text-muted-light dark:text-text-muted-dark" /> :
                         isCompleted ? <CheckCircle className="w-6 h-6 text-green-500" /> :
                         <Circle className="w-6 h-6 text-text-muted-light dark:text-text-muted-dark hover:text-primary" />}
                    </button>
                )}
            </div>
            <div className="flex-grow">
                <h4 className={`font-semibold ${isCompleted ? 'line-through text-text-muted-light dark:text-text-muted-dark' : 'text-text-light dark:text-text-dark'}`}>
                    {module.title}
                </h4>
                <p className="text-sm text-text-muted-light dark:text-text-muted-dark mt-1 italic">"{module.objective}"</p>
                <div className="flex items-center gap-2 text-xs mt-2 text-text-muted-light dark:text-text-muted-dark">
                    <ActivityIcon size={14} />
                    <span>Activity: {module.activity.resourceName ? `${module.activity.type} (${module.activity.resourceName})` : module.activity.type}</span>
                </div>
            </div>
            {isNextUp && !isCompleted && (
                <div className="flex-shrink-0 self-center">
                    <Button size="sm" onClick={handleStartModule}>Start Module</Button>
                </div>
            )}
        </div>
    );
};

// --- Create New Plan Component (with Questionnaire and Prefill Logic) ---
const CreatePlan = ({ onPlanCreated }) => {
    const [goal, setGoal] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [questionnaire, setQuestionnaire] = useState(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState([]);
    const location = useLocation();
    const navigate = useNavigate();

    const handleInitialGenerate = useCallback(async (e) => {
        if (e) e.preventDefault();
        const currentGoal = goal.trim();
        if (!currentGoal) {
            toast.error("Please enter a learning goal.");
            return;
        }
        setIsLoading(true);
        try {
            const response = await api.generateLearningPath(currentGoal);
            if (response.isQuestionnaire) {
                setQuestionnaire(response.questions);
                setAnswers(new Array(response.questions.length).fill(''));
                setCurrentStep(0);
            } else {
                toast.success("New study plan created successfully!");
                resetForm();
                onPlanCreated();
            }
        } catch (error) {
            toast.error(`Failed to start plan generation: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [goal, onPlanCreated]);
    
    useEffect(() => {
        const locationState = location.state;
        if (locationState?.prefilledGoal) {
            const prefilledGoal = locationState.prefilledGoal;
            setGoal(prefilledGoal);
            
            // This timeout allows React to update the state before we programmatically submit
            setTimeout(() => {
                const form = document.getElementById('create-plan-form');
                if (form) {
                    const submitButton = form.querySelector('button[type="submit"]');
                    if (submitButton) {
                        submitButton.click();
                    }
                }
            }, 100);

            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, handleInitialGenerate]);

    const handleAnswerChange = (index, value) => {
        const newAnswers = [...answers];
        newAnswers[index] = value;
        setAnswers(newAnswers);
    };

    const handleFinalSubmit = async () => {
        setIsLoading(true);
        const context = {
            clarificationAnswers: questionnaire.map((q, i) => ({
                question: q.questionText,
                answer: answers[i]
            }))
        };
        try {
            await api.generateLearningPath(goal.trim(), context);
            toast.success("Your personalized study plan has been created!");
            resetForm();
            onPlanCreated();
        } catch (error) {
            toast.error(`Failed to create personalized plan: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };
    
    const resetForm = () => {
        setGoal('');
        setQuestionnaire(null);
        setCurrentStep(0);
        setAnswers([]);
    };

    if (questionnaire) {
        const question = questionnaire[currentStep];
        return (
            <div className="card-base p-6 mb-8">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.3 }}
                    >
                        <p className="text-sm text-text-muted-light dark:text-text-muted-dark">Step {currentStep + 1} of {questionnaire.length}</p>
                        <h3 className="text-lg font-semibold my-2">{question.questionText}</h3>
                        {question.type === 'multiple_choice' ? (
                            <div className="space-y-2 mt-4">
                                {question.options.map(option => (
                                    <label key={option} className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${answers[currentStep] === option ? 'border-primary bg-primary/10' : 'border-border-light dark:border-border-dark'}`}>
                                        <input type="radio" name={`q-${currentStep}`} value={option} checked={answers[currentStep] === option} onChange={() => handleAnswerChange(currentStep, option)} className="form-radio" />
                                        <span className="ml-3">{option}</span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <input type="text" value={answers[currentStep]} onChange={(e) => handleAnswerChange(currentStep, e.target.value)} className="input-field mt-4" />
                        )}
                        <div className="flex justify-between items-center mt-6">
                            <Button variant="secondary" onClick={() => currentStep > 0 ? setCurrentStep(s => s - 1) : resetForm()}>
                                {currentStep > 0 ? 'Back' : 'Cancel'}
                            </Button>
                            {currentStep < questionnaire.length - 1 ? (
                                <Button onClick={() => setCurrentStep(s => s + 1)} disabled={!answers[currentStep]}>Next</Button>
                            ) : (
                                <Button onClick={handleFinalSubmit} isLoading={isLoading} disabled={!answers[currentStep]}>Generate My Plan</Button>
                            )}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="card-base p-6 mb-8">
            <h2 className="text-lg font-semibold text-center mb-4">Create a New Study Plan</h2>
            <form id="create-plan-form" onSubmit={handleInitialGenerate} className="flex flex-col sm:flex-row items-center gap-3">
                <input
                    type="text"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="What is your learning goal? e.g., 'Master Python for data science'"
                    className="input-field flex-grow !py-2.5"
                    disabled={isLoading}
                />
                <Button type="submit" isLoading={isLoading} leftIcon={<Plus size={16} />} className="w-full sm:w-auto">
                    Generate Plan
                </Button>
            </form>
        </div>
    );
};

// --- Main Study Plan Page ---
const StudyPlanPage = ({ handleNewChat }) => {
    const [learningPaths, setLearningPaths] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [activePathId, setActivePathId] = useState(null);

    const fetchPaths = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const paths = await api.getLearningPaths();
            setLearningPaths(paths);
            if (paths.length > 0 && (!activePathId || !paths.some(p => p._id === activePathId))) {
                setActivePathId(paths[0]._id);
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch learning paths.');
            toast.error(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [activePathId]);

    useEffect(() => {
        fetchPaths();
    }, [fetchPaths]);

    return (
        <div className="flex flex-col h-screen bg-background-light dark:bg-background-dark text-text-light dark:text-text-dark font-sans">
            <header className="flex-shrink-0 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark h-16 flex items-center justify-between px-6 z-10">
                <h1 className="text-xl font-bold">My Study Plans</h1>
                <Link to="/" className="flex items-center gap-2 text-sm btn btn-ghost">
                    <Home size={16}/>
                    Back to Main App
                </Link>
            </header>

            <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 custom-scrollbar">
                <div className="max-w-4xl mx-auto">
                    <CreatePlan onPlanCreated={fetchPaths} />

                    {isLoading && (
                        <div className="text-center p-8">
                            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                            <p className="mt-2 text-text-muted-light dark:text-text-muted-dark">Loading your plans...</p>
                        </div>
                    )}
                    {error && !isLoading && (
                        <div className="p-4 bg-red-500/10 text-red-500 rounded-md text-center">
                            <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
                            <p>{error}</p>
                            <Button onClick={fetchPaths} size="sm" variant="outline" className="mt-4">Retry</Button>
                        </div>
                    )}
                    {!isLoading && !error && learningPaths.length === 0 && (
                        <div className="text-center py-12 text-text-muted-light dark:text-text-muted-dark">
                            <GraduationCap size={48} className="mx-auto opacity-50 mb-4" />
                            <h3 className="font-semibold text-lg">No Study Plans Found</h3>
                            <p>Create your first plan above to get started on a personalized learning journey!</p>
                        </div>
                    )}

                    {!isLoading && !error && learningPaths.length > 0 && (
                        <div className="space-y-4">
                            {learningPaths.map(path => {
                                const isExpanded = activePathId === path._id;
                                const nextUpModule = path.modules.find(m => m.status === 'not_started' || m.status === 'in_progress');
                                return (
                                    <div key={path._id} className="card-base overflow-hidden">
                                        <h2 onClick={() => setActivePathId(isExpanded ? null : path._id)} className="px-6 py-4 text-lg font-semibold cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                            {path.title}
                                        </h2>
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                                    className="border-t border-border-light dark:border-border-dark"
                                                >
                                                    <div className="divide-y divide-border-light dark:divide-border-dark">
                                                        {path.modules.map(module => (
                                                            <ModuleItem
                                                                key={module.moduleId}
                                                                module={module}
                                                                pathId={path._id}
                                                                onModuleUpdate={fetchPaths}
                                                                isNextUp={nextUpModule?.moduleId === module.moduleId}
                                                                handleNewChat={handleNewChat}
                                                            />
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default StudyPlanPage;