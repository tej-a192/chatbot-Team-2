// server/routes/tools.js
const express = require("express");
const axios = require("axios");
const router = express.Router();
const User = require("../models/User");
const { decrypt } = require("../utils/crypto");

async function getApiKeyForRequest(userId) {
  try {
    const user = await User.findById(userId).select(
      "+encryptedApiKey preferredLlmProvider"
    );
    if (
      user &&
      user.preferredLlmProvider === "gemini" &&
      user.encryptedApiKey
    ) {
      const decryptedKey = decrypt(user.encryptedApiKey);
      if (decryptedKey) {
        return decryptedKey;
      }
    }
  } catch (e) {
    console.error(
      `Failed to get or decrypt user-specific API key for ${userId}, falling back to server key. Error: ${e.message}`
    );
  }

  // Fallback to the server's global key if the user key isn't available/applicable
  const serverKey = process.env.GEMINI_API_KEY;
  if (serverKey) {
    // console.log(`[Tools Route] Using server's fallback GEMINI_API_KEY.`);
    return serverKey;
  }

  // If neither key is available, throw the final error.
  throw new Error(
    "No valid API key is configured for this AI feature on the server, and the user has not provided one."
  );
}

// @route   POST /api/tools/execute
router.post("/execute", async (req, res) => {
  const { language, code, testCases } = req.body;
  if (!code || !language) {
    return res.status(400).json({ message: "Code and language are required." });
  }
  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
  if (!pythonServiceUrl) {
    return res
      .status(500)
      .json({ message: "Code execution service is not configured." });
  }
  const executionUrl = `${pythonServiceUrl}/execute_code`;
  try {
    const pythonResponse = await axios.post(
      executionUrl,
      { language, code, testCases },
      { timeout: 15000 }
    );
    res.status(200).json(pythonResponse.data);
  } catch (error) {
    const errorMsg =
      error.response?.data?.error || error.message || "Failed to execute code.";
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
    const apiKey = await getApiKeyForRequest(req.user._id);
    const pythonResponse = await axios.post(
      analysisUrl,
      { language, code, apiKey },
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
    const apiKey = await getApiKeyForRequest(req.user._id);
    const pythonResponse = await axios.post(
      generationUrl,
      { language, code, apiKey },
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
    const apiKey = await getApiKeyForRequest(req.user._id);
    const pythonResponse = await axios.post(
      explanationUrl,
      { language, code, errorMessage, apiKey },
      { timeout: 60000 }
    );
    res.status(200).json(pythonResponse.data);
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message;
    res.status(error.response?.status || 500).json({ message: errorMsg });
  }
});

module.exports = router;
