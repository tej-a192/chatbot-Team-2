// server/models/LLMPerformanceLog.js
const mongoose = require('mongoose');

const LLMPerformanceLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId: { type: String, required: true, index: true },
  query: { type: String, required: true },
  chosenModelId: { type: String, required: true },
  routerLogic: { type: String }, // e.g., 'subject_match', 'heuristic', 'default'
  responseTimeMs: { type: Number },
  userFeedback: { type: String, enum: ['positive', 'negative', 'none'], default: 'none' }, // For future UI feedback buttons
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('LLMPerformanceLog', LLMPerformanceLogSchema);