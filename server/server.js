// server/server.js
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const mongoose = require("mongoose");

// --- Custom Modules & Middleware ---
const connectDB = require("./config/db");
const { getLocalIPs } = require("./utils/networkUtils");
const { performAssetCleanup } = require("./utils/assetCleanup");
const { authMiddleware } = require("./middleware/authMiddleware");
const {
  fixedAdminAuthMiddleware,
} = require("./middleware/fixedAdminAuthMiddleware");

// --- Route Imports ---
const networkRoutes = require("./routes/network");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/user");
const chatRoutes = require("./routes/chat");
const uploadRoutes = require("./routes/upload");
const filesRoutes = require("./routes/files");
const analysisRoutes = require("./routes/analysis");
const adminApiRoutes = require("./routes/admin");
const subjectsRoutes = require("./routes/subjects");
const generationRoutes = require("./routes/generation");
const exportRoutes = require("./routes/export");
const kgRoutes = require("./routes/kg");
const llmConfigRoutes = require("./routes/llmConfig");
const toolsRoutes = require("./routes/tools");

// --- Configuration & Express App Setup ---
const port = process.env.PORT || 5001;
const mongoUri = process.env.MONGO_URI;
const pythonRagUrl = process.env.PYTHON_RAG_SERVICE_URL;

if (!process.env.JWT_SECRET || !process.env.ENCRYPTION_SECRET) {
  console.error(
    "!!! FATAL: JWT_SECRET or ENCRYPTION_SECRET is not set in .env file."
  );
  process.exit(1);
}
if (!mongoUri) {
  console.error("!!! FATAL: MONGO_URI is not set in .env file.");
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// --- API Route Mounting ---
app.get("/", (req, res) => res.send("AI Tutor Backend API is running..."));
app.use("/api/network", networkRoutes);
app.use("/api/auth", authRoutes);

// --- Admin Routes ---
// Apply the fixed admin auth middleware to the single admin router.
app.use("/api/admin", fixedAdminAuthMiddleware, adminApiRoutes);

// All subsequent routes are protected by the general JWT authMiddleware
app.use(authMiddleware);
app.use("/api/user", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/subjects", subjectsRoutes);
app.use("/api/generate", generationRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/kg", kgRoutes);
app.use("/api/llm", llmConfigRoutes);
app.use("/api/tools", toolsRoutes);
app.use("/api/admin", adminApiRoutes);

// --- Centralized Error Handling ---
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err);
  const statusCode = err.status || 500;
  const message = err.message || "An internal server error occurred.";
  if (!res.headersSent) {
    res.status(statusCode).json({ message });
  }
});

// --- Server Startup Logic ---
async function startServer() {
  console.log("\n--- Starting Server Initialization ---");
  try {
    await ensureServerDirectories();
    await connectDB(mongoUri);
    await performAssetCleanup();
    await checkRagService(pythonRagUrl);

    const server = app.listen(port, "0.0.0.0", () => {
      console.log("\n=== Node.js Server Ready ===");
      console.log(`🚀 Server listening on port ${port}`);
      getLocalIPs().forEach((ip) => {
        console.log(`   - http://${ip}:${port}`);
      });
      console.log("============================\n");
    });

    const gracefulShutdown = (signal) => {
      console.log(`\n${signal} received. Shutting down...`);
      server.close(() => {
        mongoose.connection.close(false, () => {
          console.log("MongoDB connection closed.");
          process.exit(0);
        });
      });
    };
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("!!! Failed to start Node.js server:", error.message);
    process.exit(1);
  }
}

// Helper functions
async function ensureServerDirectories() {
  const dirs = [
    path.join(__dirname, "assets"),
    path.join(__dirname, "backup_assets"),
    path.join(__dirname, "generated_docs"),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
  }
}
async function checkRagService(url) {
  if (!url) {
    console.warn("! Python RAG service URL not configured.");
    return;
  }
  try {
    const response = await axios.get(`${url}/health`, { timeout: 7000 });
    if (response.data.status === "ok") {
      console.log("✓ Python RAG service is available.");
    } else {
      console.warn(
        `! Python RAG service responded but is not healthy. Status: ${response.data.status}`
      );
    }
  } catch (error) {
    console.warn("! Python RAG service is not reachable.");
  }
}

startServer();