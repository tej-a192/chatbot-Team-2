const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- NEW: Define the Profile sub-schema for organization ---
const ProfileSchema = new mongoose.Schema({
    name: { type: String, default: '', trim: true },
    college: { type: String, default: '', trim: true },
    universityNumber: { type: String, default: '', trim: true },
    degreeType: { type: String, default: '', trim: true },
    branch: { type: String, default: '', trim: true },
    year: { type: String, default: '', trim: true },
}, { _id: false }); // _id: false prevents Mongoose from creating an _id for the sub-document

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Please provide a username'],
    unique: true,
    trim: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false,
  },
  
  // --- MODIFIED: Add the profile schema to the User model ---
  profile: {
    type: ProfileSchema,
    default: () => ({}) // Default to an empty object
  },

  uploadedDocuments: [
    {
      filename: {
        type: String,
      },
      text: {
        type: String,
        default: "",
      },
      analysis: {
        faq: {
          type: String,
          default: "",
        },
        topics: {
          type: String,
          default: "",
        },
        mindmap: {
          type: String,
          default: "",
        },
      },
    },
  ],

  preferredLlmProvider: {
    type: String,
    enum: ['gemini', 'ollama'],
    default: 'gemini',
  },
  ollamaModel: {
    type: String,
    default: process.env.OLLAMA_DEFAULT_MODEL || 'qwen2.5:14b-instruct',
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Password hashing middleware before saving (no changes here)
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to compare password (no changes here)
UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
      console.error("Attempted to compare password, but password field was not loaded on the User object.");
      throw new Error("Password field not available for comparison.");
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Static method to find user by credentials (no changes here)
UserSchema.statics.findByCredentials = async function(username, password) {
    const user = await this.findOne({ username }).select('+password');
    if (!user) {
        console.log(`findByCredentials: User not found for username: ${username}`);
        return null;
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        console.log(`findByCredentials: Password mismatch for username: ${username}`);
        return null;
    }
    console.log(`findByCredentials: Credentials match for username: ${username}`);
    return user;
};


const User = mongoose.model('User', UserSchema);

module.exports = User;