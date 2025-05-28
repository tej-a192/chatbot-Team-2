// server/routes/auth.js
const express = require("express");
const { v4: uuidv4 } = require("uuid"); // For generating session IDs
const User = require("../models/User"); // Mongoose User model
const jwt = require("jsonwebtoken"); // Import jsonwebtoken
// require('dotenv').config(); // dotenv is loaded in server.js

const router = express.Router();

// Helper function to generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "1d" } // Token expires in 1 day, adjust as needed
  );
};

// --- @route   POST /api/auth/signup ---
// --- @desc    Register a new user ---
// --- @access  Public ---
router.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Please provide username and password" });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters long" });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const newUser = new User({ username, password });
    await newUser.save();

    const token = generateToken(newUser);
    const sessionId = uuidv4();

    res.status(201).json({
      token: token, // <<< ADDED TOKEN
      _id: newUser._id,
      username: newUser.username,
      sessionId: sessionId,
      message: "User registered successfully",
    });
  } catch (error) {
    console.error("Signup Error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Username already exists." });
    }
    res.status(500).json({ message: "Server error during signup" });
  }
});

// --- @route   POST /api/auth/signin ---
// --- @desc    Authenticate user (using custom static method) ---
// --- @access  Public ---
router.post("/signin", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Please provide username and password" });
  }

  try {
    const user = await User.findByCredentials(username, password);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);
    const sessionId = uuidv4();

    res.status(200).json({
      token: token, // <<< ADDED TOKEN
      _id: user._id,
      username: user.username,
      sessionId: sessionId,
      message: "Login successful",
    });
  } catch (error) {
    console.error("Signin Error:", error);
    res.status(500).json({ message: "Server error during signin" });
  }
});

// --- @route   GET /api/auth/me ---
// --- @desc    Get current authenticated user details based on token ---
// --- @access  Private (will be protected by new jwtAuth middleware) ---
const jwtAuth = require("../middleware/jwtAuth"); // Placeholder for now, will create next
router.get("/me", jwtAuth, async (req, res) => {
  // Use jwtAuth middleware
  try {
    // req.user is attached by the jwtAuth middleware
    // We select specific fields to return, excluding password even if it was on req.user
    const user = await User.findById(req.user.id).select(
      "username _id createdAt"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found from token." });
    }
    res.json({
      _id: user._id,
      username: user.username,
      createdAt: user.createdAt,
      // Add any other non-sensitive user fields you want the frontend to have
    });
  } catch (error) {
    console.error("Error in /me route:", error);
    res.status(500).json({ message: "Server error verifying user." });
  }
});

module.exports = router;
