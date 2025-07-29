// server/routes/tools.js
const express = require("express");
const axios = require("axios");
const router = express.Router();
const User = require('../models/User'); // Import User model
const { decrypt } = require('../utils/crypto'); // Import decrypt function

// This entire router will be protected by the main authMiddleware in server.js
async function getApiKeyForUser(userId) {
    const user = await User.findById(userId).select('+encryptedApiKey preferredLlmProvider');
    if (!user) {
        throw new Error("User not found.");
    }
    if (user.preferredLlmProvider === 'gemini') {
        if (!user.encryptedApiKey) {
            throw new Error("User has selected Gemini but has no API key configured.");
        }
        return decrypt(user.encryptedApiKey);
    }
    return null; 
}

// @route   POST /api/tools/execute
// @desc    Execute code by proxying to the Python service
// @access  Private
router.post("/execute", async (req, res) => {
  const { language, code, testCases } = req.body;

  if (!code || !language) {
    return res.status(400).json({ message: "Code and language are required." });
  }

  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
  if (!pythonServiceUrl) {
    console.error("[Code Executor] PYTHON_RAG_SERVICE_URL is not set.");
    return res
      .status(500)
      .json({ message: "Code execution service is not configured." });
  }

  const executionUrl = `${pythonServiceUrl}/execute_code`;
  console.log(
    `[Node Tools] Forwarding code execution request to: ${executionUrl}`
  );

  try {
    const pythonResponse = await axios.post(
      executionUrl,
      {
        language,
        code,
        testCases,
      },
      { timeout: 15000 }
    ); // 15-second timeout for the entire execution process

    res.status(200).json(pythonResponse.data);
  } catch (error) {
    const errorMsg =
      error.response?.data?.error || error.message || "Failed to execute code.";
    console.error(
      `[Node Tools] Error calling Python execution service: ${errorMsg}`
    );
    res.status(error.response?.status || 500).json({ message: errorMsg });
  }
});

// @route   POST /api/tools/analyze-code
router.post("/analyze-code", async (req, res) => {
  const { language, code } = req.body;
  if (!code || !language) {
    return res.status(400).json({ message: "Code and language are required." });
  }

  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
  if (!pythonServiceUrl) {
    return res.status(500).json({ message: "AI service is not configured." });
  }

  const analysisUrl = `${pythonServiceUrl}/analyze_code`;
  try {
    const apiKey = await getApiKeyForUser(req.user._id);
    const pythonResponse = await axios.post(
      analysisUrl,
      { language, code, apiKey }, // Pass apiKey
      { timeout: 60000 }
    );
    res.status(200).json(pythonResponse.data);
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message;
    res.status(error.response?.status || 500).json({ message: errorMsg });
  }
});

// @route   POST /api/tools/generate-test-cases
router.post("/generate-test-cases", async (req, res) => {
  const { language, code } = req.body;
  if (!code || !language) {
    return res.status(400).json({ message: "Code and language are required." });
  }

  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
  if (!pythonServiceUrl) {
    return res.status(500).json({ message: "AI service is not configured." });
  }

  const generationUrl = `${pythonServiceUrl}/generate_test_cases`;
  try {
    const apiKey = await getApiKeyForUser(req.user._id);
    const pythonResponse = await axios.post(
      generationUrl,
      { language, code, apiKey }, // Pass apiKey
      { timeout: 60000 }
    );
    res.status(200).json(pythonResponse.data);
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message;
    res.status(error.response?.status || 500).json({ message: errorMsg });
  }
});

// @route   POST /api/tools/explain-error
router.post("/explain-error", async (req, res) => {
  const { language, code, errorMessage } = req.body;
  if (!code || !language || !errorMessage) {
    return res
      .status(400)
      .json({ message: "Code, language, and errorMessage are required." });
  }

  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
  if (!pythonServiceUrl) {
    return res.status(500).json({ message: "AI service is not configured." });
  }

  const explanationUrl = `${pythonServiceUrl}/explain_error`;
  try {
    const apiKey = await getApiKeyForUser(req.user._id);
    const pythonResponse = await axios.post(
      explanationUrl,
      { language, code, errorMessage, apiKey }, // Pass apiKey
      { timeout: 60000 }
    );
    res.status(200).json(pythonResponse.data);
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message;
    res.status(error.response?.status || 500).json({ message: errorMsg });
  }
});

module.exports = router;