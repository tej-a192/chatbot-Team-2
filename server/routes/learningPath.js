// server/routes/learningPath.js
const express = require('express');
const router = express.Router();
const LearningPath = require('../models/LearningPath');
const { createLearningPath } = require('../services/learning/curriculumOrchestrator');

// @route   POST /api/learning/paths/generate
// @desc    Create a new learning path for the authenticated user based on a goal.
// @access  Private
router.post('/generate', async (req, res) => {
    const { goal, context } = req.body;
    const userId = req.user._id;

    if (!goal) {
        return res.status(400).json({ message: 'A learning goal is required.' });
    }

    try {
        const newPath = await createLearningPath(userId, goal, context);
        res.status(201).json(newPath);
    } catch (error) {
        console.error(`[API Error] Failed to create learning path for user ${userId}:`, error);
        res.status(500).json({ message: `Server error: ${error.message}` });
    }
});

// @route   GET /api/learning/paths
// @desc    Get all learning paths for the authenticated user.
// @access  Private
router.get('/', async (req, res) => {
    const userId = req.user._id;

    try {
        const paths = await LearningPath.find({ userId: userId }).sort({ createdAt: -1 });
        res.status(200).json(paths);
    } catch (error) {
        console.error(`[API Error] Failed to retrieve learning paths for user ${userId}:`, error);
        res.status(500).json({ message: 'Server error while fetching learning paths.' });
    }
});


router.put('/:pathId/modules/:moduleId', async (req, res) => {
    const { pathId, moduleId } = req.params;
    const { status } = req.body;
    const userId = req.user._id;

    if (!status || !['completed', 'in_progress', 'not_started'].includes(status)) {
        return res.status(400).json({ message: 'A valid status is required (completed, in_progress, not_started).' });
    }

    try {
        // Find the learning path ensuring it belongs to the current user
        const learningPath = await LearningPath.findOne({ _id: pathId, userId: userId });

        if (!learningPath) {
            return res.status(404).json({ message: 'Learning path not found or you do not have permission to modify it.' });
        }

        const moduleIndex = learningPath.modules.findIndex(m => m.moduleId === moduleId);
        if (moduleIndex === -1) {
            return res.status(404).json({ message: 'Module not found in this learning path.' });
        }

        // Update the status of the specific module
        learningPath.modules[moduleIndex].status = status;

        // Business Logic: If a module is completed, unlock the next one
        if (status === 'completed' && moduleIndex + 1 < learningPath.modules.length) {
            // Check if the next module is currently locked
            if (learningPath.modules[moduleIndex + 1].status === 'locked') {
                learningPath.modules[moduleIndex + 1].status = 'not_started';
            }
        }

        // Mark the document as modified before saving
        learningPath.markModified('modules');
        await learningPath.save();
        
        // Return the entire updated path so the frontend can refresh its state
        res.status(200).json(learningPath);

    } catch (error) {
        console.error(`[API Error] Failed to update module status for user ${userId}:`, error);
        res.status(500).json({ message: 'Server error while updating module status.' });
    }
});


module.exports = router;