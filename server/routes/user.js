// server/routes/user.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { redisClient } = require('../config/redisClient');
const { auditLog } = require('../utils/logger');

// Note: The main 'authMiddleware' will be applied in server.js before this router is used,
// so we don't need to add it to each route here. req.user will be available.

// @route   GET /api/user/profile
// @desc    Get the current user's profile data
// @access  Private
router.get('/profile', async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('profile');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        // Return the profile object, or an empty object if it doesn't exist
        res.json(user.profile || {});
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server error while fetching profile.' });
    }
});

// @route   PUT /api/user/profile
// @desc    Update the current user's profile data
// @access  Private
router.put('/profile', async (req, res) => {
    // 1. Destructure all possible profile fields, including the new ones
    const { name, college, universityNumber, degreeType, branch, year, learningStyle, currentGoals } = req.body;

    // 2. Update validation to include the new required fields
    if (!name || !college || !universityNumber || !degreeType || !branch || !year || !learningStyle) {
        return res.status(400).json({ message: 'All profile fields are required.' });
    }

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // 3. Update the profile sub-document with all fields
        // This ensures a complete and consistent profile object is always saved.
        user.profile = {
            name,
            college,
            universityNumber,
            degreeType,
            branch,
            year,
            learningStyle,
            currentGoals: currentGoals || ''
        };
        // The performanceMetrics field is intentionally not updated here, as it's managed by the system.

        await user.save();
        
        auditLog(req, 'USER_PROFILE_UPDATE_SUCCESS', {
            updatedFields: Object.keys(req.body) // Log which fields were included in the update
        });
        
        if (redisClient && redisClient.isOpen) {
            const cacheKey = `user:${req.user._id}`;
            await redisClient.del(cacheKey);
            console.log(`[Cache Invalidation] Deleted cache for user ${req.user._id} due to profile update.`);
        }
        res.json({
            message: 'Profile updated successfully!',
            profile: user.profile
        });

    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ message: 'Server error while updating profile.' });
    }
});


module.exports = router;