// server/routes/llmConfig.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { encrypt } = require('../utils/crypto'); // For encrypting API key

// @route   PUT /api/llm/config
// @desc    Update user's LLM preferences (provider and API key)
// @access  Private (authMiddleware will be applied in server.js)
router.put('/config', async (req, res) => {
    const { llmProvider, geminiApiKey, ollamaApiKey } = req.body;
    const userId = req.user._id;

    try {
        const updates = {};
        let newApiKeyToEncrypt = null;

        if (llmProvider) {
            if (!['gemini', 'ollama'].includes(llmProvider)) {
                return res.status(400).json({ message: "Invalid LLM provider specified." });
            }
            updates.preferredLlmProvider = llmProvider;

            if (llmProvider === 'gemini' && geminiApiKey && typeof geminiApiKey === 'string' && geminiApiKey.trim() !== "") {
                newApiKeyToEncrypt = geminiApiKey.trim();
            } else if (llmProvider === 'ollama' && ollamaApiKey && typeof ollamaApiKey === 'string' && ollamaApiKey.trim() !== "") {
                newApiKeyToEncrypt = ollamaApiKey.trim();
            } else if (llmProvider) { 
                updates.encryptedApiKey = null;
            }
        } else {
            const currentUser = await User.findById(userId).select('preferredLlmProvider');
            if (!currentUser) return res.status(404).json({ message: "User not found." });

            if (currentUser.preferredLlmProvider === 'gemini' && geminiApiKey && typeof geminiApiKey === 'string' && geminiApiKey.trim() !== "") {
                newApiKeyToEncrypt = geminiApiKey.trim();
            } else if (currentUser.preferredLlmProvider === 'ollama' && ollamaApiKey && typeof ollamaApiKey === 'string' && ollamaApiKey.trim() !== "") {
                newApiKeyToEncrypt = ollamaApiKey.trim();
            }
        }
        
        if (newApiKeyToEncrypt) {
            updates.encryptedApiKey = encrypt(newApiKeyToEncrypt);
            if (!updates.encryptedApiKey && newApiKeyToEncrypt) { 
                console.error(`User ${userId}: API key encryption failed for provided key.`);
                return res.status(500).json({ message: "Failed to secure API key. Update aborted." });
            }
        } else if (llmProvider && !newApiKeyToEncrypt) {
             // If provider is changing AND no new key for the new provider is given, clear the existing key.
             // This condition ensures we only clear if the provider is indeed changing.
             const user = await User.findById(userId).select('preferredLlmProvider');
             if (user && user.preferredLlmProvider !== llmProvider) {
                 updates.encryptedApiKey = null;
             }
        }


        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ message: "No valid update information provided." });
        }
        
        const updatedUser = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true });

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found during update." });
        }

        res.status(200).json({ message: "LLM preferences updated successfully." });
    } catch (error) {
        console.error(`Error updating LLM config for user ${userId}:`, error);
        res.status(500).json({ message: `Server error while updating LLM preferences: ${error.message}` });
    }
});

router.get('/config', async (req, res) => {
    const userId = req.user._id;
    try {
        const user = await User.findById(userId).select('preferredLlmProvider ollamaModel');
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        res.status(200).json({
            preferredLlmProvider: user.preferredLlmProvider,
            ollamaModel: user.ollamaModel
        });
    } catch (error) {
        console.error(`Error fetching LLM config for user ${userId}:`, error);
        res.status(500).json({ message: "Server error fetching LLM preferences." });
    }
});

module.exports = router;