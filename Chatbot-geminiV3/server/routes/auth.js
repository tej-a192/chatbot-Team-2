// server/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken'); // <-- Import jsonwebtoken
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/authMiddleware');
require('dotenv').config(); // Ensures process.env has values from .env

const router = express.Router();

const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '1h'; // Default to 1 hour

// --- @route   POST /api/auth/signup ---
// --- @desc    Register a new user ---
// --- @access  Public ---
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please provide username and password' });
  }
  if (password.length < 6) {
     return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const newUser = new User({ username, password });
    await newUser.save();

    const sessionId = uuidv4(); // Initial session ID

    // Create JWT Payload
    const payload = {
      userId: newUser._id,
      username: newUser.username,
    };

    // Sign the token
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET, // Make sure JWT_SECRET is in your .env
      { expiresIn: JWT_EXPIRATION }
    );

    res.status(201).json({
      token: token, // <-- Send token
      _id: newUser._id,
      username: newUser.username,
      sessionId: sessionId,
      message: 'User registered successfully',
    });

  } catch (error) {
    console.error('Signup Error:', error);
    if (error.code === 11000) {
        return res.status(400).json({ message: 'Username already exists.' });
    }
    res.status(500).json({ message: 'Server error during signup' });
  }
});

// --- @route   POST /api/auth/signin ---
// --- @desc    Authenticate user & return JWT ---
// --- @access  Public ---
router.post('/signin', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please provide username and password' });
  }

  try {
    const user = await User.findByCredentials(username, password);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const sessionId = uuidv4(); // New session ID for this login

    // Create JWT Payload
    const payload = {
      userId: user._id,
      username: user.username,
    };

    // Sign the token
    const token = jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRATION }
    );

    res.status(200).json({
      token: token, // <-- Send token
      _id: user._id,
      username: user.username,
      sessionId: sessionId,
      message: 'Login successful',
    });

  } catch (error) {
    console.error('Signin Error:', error);
    res.status(500).json({ message: 'Server error during signin' });
  }
});

// --- @route   GET /api/auth/me ---
// --- @desc    Get current authenticated user's details (requires JWT middleware) ---
// --- @access  Private ---
// We will add the middleware for this route in server.js
router.get('/me',authMiddleware, async (req, res) => {
    // If the JWT middleware (to be created next) runs successfully,
    // req.user will be populated.
    if (!req.user) {
        // This should ideally be caught by the middleware itself,
        // but as a fallback.
        return res.status(401).json({ message: 'Not authorized, user context missing.' });
    }
    try {
        // req.user is already the user document (excluding password typically)
        // thanks to the upcoming authMiddleware.
        res.status(200).json({
            _id: req.user._id,
            username: req.user.username,
            // Add any other fields you want the frontend to know about the user
            // e.g., email, roles, preferences, if stored.
        });
    } catch (error) {
        console.error('Error in /api/auth/me:', error);
        res.status(500).json({ message: 'Server error fetching user details.' });
    }
});


module.exports = router;