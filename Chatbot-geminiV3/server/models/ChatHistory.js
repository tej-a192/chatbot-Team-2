const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid'); // For default message ID if needed

const MessageSchema = new mongoose.Schema({
    // id: { type: String, default: uuidv4 }, // Client usually generates this for optimistic updates
    role: { // 'user' or 'model' (for Gemini compatibility)
        type: String,
        enum: ['user', 'model'],
        required: true
    },
    parts: [{ // Gemini structure
        text: {
            type: String,
            required: true
        },
        // _id: false // Mongoose adds _id by default, can disable if truly not needed per part
    }],
    timestamp: {
        type: Date,
        default: Date.now
    },
    // Optional fields from AI response
    thinking: {
        type: String,
        default: ''
    },
    references: {
        type: Array, // Array of objects like { number, source, content_preview }
        default: []
    },
    source_pipeline: { // e.g., "gemini-direct", "gemini-rag"
        type: String,
        default: ''
    }
}, { _id: false }); // Don't create separate _id for each message object in the array

const ChatHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    sessionId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    messages: [MessageSchema],
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    }
});

ChatHistorySchema.pre('save', function (next) {
    if (this.isModified()) {
      this.updatedAt = Date.now();
    }
    next();
});

ChatHistorySchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const ChatHistory = mongoose.model('ChatHistory', ChatHistorySchema);
module.exports = ChatHistory;