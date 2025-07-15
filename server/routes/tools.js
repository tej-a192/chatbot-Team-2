// server/routes/tools.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

// This entire router will be protected by the main authMiddleware in server.js

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
    // Pass through the status code from the Python service if available, otherwise use 500
    res.status(error.response?.status || 500).json({ message: errorMsg });
  }
});

module.exports = router;
