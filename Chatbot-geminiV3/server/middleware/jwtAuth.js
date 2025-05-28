// server/middleware/jwtAuth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");
// require('dotenv').config(); // dotenv loaded in server.js

const jwtAuth = async (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (!authHeader) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  // Check for Bearer token format
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ message: "Token is not in Bearer format" });
  }
  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Add user from payload to request object
    // Fetch full user object to ensure it's still valid and for potential role checks later
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res
        .status(401)
        .json({
          message: "Token valid, but user not found. Authorization denied.",
        });
    }
    req.user = user; // Attach the Mongoose user document
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token is expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res
        .status(401)
        .json({ message: "Token is not valid (malformed)" });
    }
    // For other errors during verification (e.g., secret mismatch, though less likely if set correctly)
    console.error("JWT Verification Error:", err.message);
    res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = jwtAuth;
