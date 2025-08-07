// server/routes/user.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { redisClient } = require('../config/redisClient');

// @route   GET /api/user/profile
// @desc    Get the current user's profile data
// @access  Private
router.get('/profile', async (req, res) => {
    try {
        // This part is correct from the previous fix
        const user = await User.findById(req.user._id).select('profile hasCompletedOnboarding');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        const profileData = user.profile ? user.profile.toObject() : {};
        profileData.hasCompletedOnboarding = user.hasCompletedOnboarding;
        
        res.json(profileData);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server error while fetching profile.' });
    }
});

// @route   PUT /api/user/profile
// @desc    Update the current user's profile data
// @access  Private
router.put('/profile', async (req, res) => {
    const { name, college, universityNumber, degreeType, branch, year, learningStyle, currentGoals } = req.body;

    if (!name || !college || !universityNumber || !degreeType || !branch || !year || !learningStyle) {
        return res.status(400).json({ message: 'All profile fields are required.' });
    }

    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        user.profile = {
            name, college, universityNumber, degreeType, branch, year,
            learningStyle, currentGoals: currentGoals || ''
        };

        await user.save();
        
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

// --- THIS IS THE FINAL, CORRECTED ROUTE ---
// @route   PUT /api/user/profile/onboarding-complete
// @desc    Mark the user's onboarding as complete
// @access  Private
router.put('/profile/onboarding-complete', async (req, res) => {
    try {
        const result = await User.updateOne(
            { _id: req.user._id },
            { $set: { hasCompletedOnboarding: true } }
        );
        
        if (result.matchedCount === 0) {
             return res.status(404).json({ message: 'User not found to update.' });
        }
        
        console.log(`[Onboarding] User ${req.user._id} status updated to complete.`);
        res.status(200).json({ message: 'Onboarding status updated successfully.' });
    } catch (error) {
        console.error('Error updating onboarding status:', error);
        res.status(500).json({ message: 'Server error while updating onboarding status.' });
    }
});

module.exports = router;