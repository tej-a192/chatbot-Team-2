// server/routes/tools.js
const express = require("express");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const router = express.Router();
const User = require("../models/User");
const { decrypt } = require("../utils/crypto");

// --- THIS IS THE FIX ---
// We switch from a simple 'dest' to a 'storage' configuration
// to gain control over the temporary filename and preserve the extension.
const quizStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const tempDir = path.join(__dirname, "..", "temp_uploads");
    // Ensure the temp directory exists
    fs.mkdir(tempDir, { recursive: true }, (err) => cb(err, tempDir));
  },
  filename: function (req, file, cb) {
    // Create a unique filename while preserving the original file's extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + extension);
  },
});

const quizUpload = multer({
  storage: quizStorage, // Use our new storage engine
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB limit
});

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

  const serverKey = process.env.GEMINI_API_KEY;
  if (serverKey) {
    return serverKey;
  }

  throw new Error(
    "No valid API key is configured for this AI feature on the server, and the user has not provided one."
  );
}

// ... (existing tool routes like /execute, /analyze-code, etc. remain the same) ...
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

// @route   POST /api/tools/generate-quiz
// @desc    Generate a quiz from an uploaded document
// @access  Private
router.post("/generate-quiz", quizUpload.single("file"), async (req, res) => {
  const { quizOption } = req.body;
  const file = req.file;

  if (!file) {
    return res
      .status(400)
      .json({ message: "A file is required to generate a quiz." });
  }
  if (!quizOption) {
    await fs.promises.unlink(file.path);
    return res
      .status(400)
      .json({ message: "Quiz option is required." });
  }

  const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
  if (!pythonServiceUrl) {
    await fs.promises.unlink(file.path);
    return res
      .status(500)
      .json({ message: "Quiz generation service is not configured." });
  }

  const generationUrl = `${pythonServiceUrl}/generate_quiz`;
  const form = new FormData();
  form.append("file", fs.createReadStream(file.path));
  form.append("quiz_option", quizOption);

  try {
    const apiKey = await getApiKeyForRequest(req.user._id);
    form.append("api_key", apiKey);

    console.log(
      `[Node Quiz] Forwarding quiz generation request to Python service.`
    );
    const pythonResponse = await axios.post(generationUrl, form, {
      headers: form.getHeaders(),
      timeout: 300000,
    });

    res.status(200).json(pythonResponse.data);
  } catch (error) {
    const errorMsg =
      error.response?.data?.error ||
      error.message ||
      "Failed to generate quiz.";
    console.error(`[Node Quiz] Error calling Python service: ${errorMsg}`);
    res.status(error.response?.status || 500).json({ message: errorMsg });
  } finally {
    await fs.promises
      .unlink(file.path)
      .catch((err) =>
        console.error(`Failed to delete temp quiz file: ${err.message}`)
      );
  }
});

module.exports = router;
