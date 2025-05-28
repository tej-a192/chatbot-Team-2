// server/server.js
const express = require("express");
const dotenv = require("dotenv"); // Keep this for loading .env
const cors = require("cors");
const path = require("path");
const { getLocalIPs } = require("./utils/networkUtils");
const fs = require("fs");
const axios = require("axios");
const os = require("os");
const mongoose = require("mongoose");
const readline = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout,
});

// --- Custom Modules ---
const connectDB = require("./config/db");
const { performAssetCleanup } = require("./utils/assetCleanup");
const jwtAuth = require("./middleware/jwtAuth"); // <<< IMPORT NEW JWT MIDDLEWARE
// const { tempAuth } = require('./middleware/authMiddleware'); // <<< COMMENT OUT OR REMOVE OLD tempAuth

// --- Configuration Loading ---
dotenv.config(); // Load environment variables from .env file

// ... (Keep DEFAULT_PORT, DEFAULT_MONGO_URI, DEFAULT_PYTHON_RAG_URL as is) ...
let port = process.env.PORT || 5001;
let mongoUri =
  process.env.MONGO_URI || "mongodb://localhost:27017/chatbotGeminiDB";
let pythonRagUrl =
  process.env.PYTHON_RAG_SERVICE_URL || "http://localhost:5000";
let geminiApiKey = process.env.GEMINI_API_KEY || "";

// --- Express Application Setup ---
const app = express();

// --- Core Middleware ---
app.use(cors());
app.use(express.json());

// --- Basic Root Route ---
app.get("/", (req, res) => res.send("Chatbot Backend API is running..."));

// --- API Route Mounting ---
app.use("/api/network", require("./routes/network")); // For IP info (public)
app.use("/api/auth", require("./routes/auth")); // Auth routes (signup, signin are public, /me is protected within the route file)

// Protected Routes - Apply jwtAuth middleware
app.use("/api/chat", jwtAuth, require("./routes/chat"));
app.use("/api/upload", jwtAuth, require("./routes/upload"));
app.use("/api/files", jwtAuth, require("./routes/files"));
app.use("/api/syllabus", jwtAuth, require("./routes/syllabus"));

// --- Centralized Error Handling Middleware ---
// ... (keep as is) ...
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err);
  const statusCode = err.status || 500;
  let message = err.message || "An internal server error occurred.";
  if (process.env.NODE_ENV === "production" && statusCode === 500) {
    message = "An internal server error occurred.";
  }
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(statusCode).json({ message: message });
  }
  res.status(statusCode).send(message);
});

// --- Server Instance Variable ---
let server;

// --- Graceful Shutdown Logic ---
// ... (keep as is) ...
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  readline.close();
  try {
    if (server) {
      server.close(async () => {
        console.log("HTTP server closed.");
        try {
          await mongoose.connection.close();
          console.log("MongoDB connection closed.");
        } catch (dbCloseError) {
          console.error("Error closing MongoDB connection:", dbCloseError);
        }
        process.exit(0);
      });
    } else {
      try {
        await mongoose.connection.close();
        console.log("MongoDB connection closed.");
      } catch (dbCloseError) {
        console.error("Error closing MongoDB connection:", dbCloseError);
      }
      process.exit(0);
    }
    setTimeout(() => {
      console.error("Graceful shutdown timed out, forcing exit.");
      process.exit(1);
    }, 10000);
  } catch (shutdownError) {
    console.error("Error during graceful shutdown initiation:", shutdownError);
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// --- RAG Service Health Check ---
// ... (keep as is) ...
async function checkRagService(url) {
  console.log(`\nChecking RAG service health at ${url}...`);
  try {
    // Use pythonRagUrl global variable, which is set by env or prompt
    const response = await axios.get(`${pythonRagUrl}/health`, {
      timeout: 7000,
    });
    if (response.status === 200 && response.data?.status === "ok") {
      console.log("✓ RAG service is available and healthy.");
      // Enhanced logging based on your app.py structure
      const qdrantStatus = response.data?.qdrant_service || "N/A";
      const collectionStatus = response.data?.qdrant_collection_status || "N/A";
      console.log(
        `  Qdrant Service: ${qdrantStatus}, Collection: ${collectionStatus}`
      );
      console.log(
        `  Doc Embed Model: ${response.data?.document_embedding_model}, Query Embed Model: ${response.data?.query_embedding_model}`
      );
      if (
        response.data?.qdrant_collection_status &&
        response.data.qdrant_collection_status.includes("mismatch")
      ) {
        console.warn(
          `  RAG Health Warning: Vector dimension mismatch detected in Qdrant.`
        );
      }
      return true;
    } else {
      console.warn(
        `! RAG service responded but status is not OK: ${
          response.status
        } - ${JSON.stringify(response.data)}`
      );
      return false;
    }
  } catch (error) {
    console.warn("! RAG service is not reachable.");
    if (error.code === "ECONNREFUSED") {
      console.warn(
        `  Connection refused at ${pythonRagUrl}. Ensure the RAG service (server/rag_service/app.py) is running.`
      );
    } else if (
      error.code === "ECONNABORTED" ||
      error.message.includes("timeout")
    ) {
      console.warn(
        `  Connection timed out to ${pythonRagUrl}. The RAG service might be slow to start or unresponsive.`
      );
    } else {
      console.warn(`  Error: ${error.message}`);
    }
    console.warn(
      "  RAG features (document upload processing, context retrieval) will be unavailable."
    );
    return false;
  }
}

// --- Directory Structure Check ---
// ... (keep as is) ...
async function ensureServerDirectories() {
  const dirs = [
    path.join(__dirname, "assets"),
    path.join(__dirname, "backup_assets"),
    path.join(__dirname, "syllabi"), // <<< ENSURE SYLLABI DIR IS CHECKED/CREATED
  ];
  console.log("\nEnsuring server directories exist...");
  try {
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
        console.log(`  Created directory: ${dir}`);
      }
    }
    console.log("✓ Server directories checked/created.");
  } catch (error) {
    console.error("!!! Error creating essential server directories:", error);
    throw error;
  }
}

// --- Prompt for Configuration ---
// ... (keep as is) ...
function askQuestion(query) {
  return new Promise((resolve) => readline.question(query, resolve));
}

async function configureAndStart() {
  console.log("--- Starting Server Configuration ---");

  if (!geminiApiKey) {
    console.error(
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    );
    console.error(
      "!!! FATAL: GEMINI_API_KEY environment variable is not set. !!!"
    );
    console.error(
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    );
    process.exit(1);
  } else {
    console.log("✓ GEMINI_API_KEY found.");
  }
  if (!process.env.JWT_SECRET) {
    // Check for JWT_SECRET too
    console.error(
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    );
    console.error(
      "!!! FATAL: JWT_SECRET environment variable is not set.     !!!"
    );
    console.error(
      "!!! Please set it for secure token generation.             !!!"
    );
    console.error(
      "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    );
    process.exit(1);
  } else {
    console.log("✓ JWT_SECRET found.");
  }

  if (!mongoUri) {
    const answer = await askQuestion(
      `Enter MongoDB URI or press Enter for default (${"mongodb://localhost:27017/chatbotGeminiDB"}): `
    );
    mongoUri = answer.trim() || "mongodb://localhost:27017/chatbotGeminiDB";
  }
  console.log(`Using MongoDB URI: ${mongoUri}`);
  process.env.MONGO_URI = mongoUri;

  if (!pythonRagUrl) {
    const answer = await askQuestion(
      `Enter Python RAG Service URL or press Enter for default (${"http://localhost:5002"}): `
    );
    pythonRagUrl = answer.trim() || "http://localhost:5002";
  }
  console.log(`Using Python RAG Service URL: ${pythonRagUrl}`);
  process.env.PYTHON_RAG_SERVICE_URL = pythonRagUrl;

  console.log(`Node.js server will listen on port: ${port}`);
  readline.close();
  console.log("--- Configuration Complete ---");
  await startServer();
}

// --- Asynchronous Server Startup Function ---
// ... (keep as is, but ensure it uses the globally set pythonRagUrl) ...
async function startServer() {
  console.log("\n--- Starting Server Initialization ---");
  try {
    await ensureServerDirectories();
    await connectDB(mongoUri); // Ensure mongoUri is passed
    await performAssetCleanup();
    await checkRagService(pythonRagUrl); // Ensure pythonRagUrl is passed or globally available

    const PORT = port;
    const availableIPs = getLocalIPs();

    server = app.listen(PORT, "0.0.0.0", () => {
      console.log("\n=== Node.js Server Ready ===");
      console.log(`🚀 Server listening on port ${PORT}`);
      console.log(
        "   Access the application via these URLs (using common frontend ports):"
      );
      const frontendPorts = [3000, 3001, 8080, 5173];
      availableIPs.forEach((ip) => {
        frontendPorts.forEach((fp) => {
          console.log(
            `   - http://${ip}:${fp} (Frontend) -> Connects to Backend at http://${ip}:${PORT}`
          );
        });
      });
      console.log("============================\n");
      console.log(
        "💡 Hint: Client automatically detects backend IP based on how you access the frontend."
      );
      console.log(
        `   Ensure firewalls allow connections on port ${PORT} (Backend) and your frontend port.`
      );
      console.log("--- Server Initialization Complete ---");
    });
  } catch (error) {
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    console.error("!!! Failed to start Node.js server:", error.message);
    console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
    process.exit(1);
  }
}

// --- Execute Configuration and Server Start ---
configureAndStart();
