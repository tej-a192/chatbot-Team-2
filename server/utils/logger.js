// server/utils/logger.js
const winston = require('winston');
const path = require('path');

// This path is correct
const logFilePath = path.join(__dirname, '..', 'logs', 'app.log'); // <-- Make sure this is app.log
// --- THIS IS THE CORRECT, SIMPLIFIED FORMAT ---
const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    // This custom formatter ensures the message and metadata are structured consistently
    winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
        const logObject = {
            level,
            timestamp,
            service: service || 'ai-tutor-nodejs-backend', // Ensure service name is always present
            message, // The primary message string
            ...metadata // Spread the rest of the metadata
        };
        return JSON.stringify(logObject);
    })
);// --- END CORRECTION ---

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'ai-tutor-nodejs-backend' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: logFilePath,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ],
    exitOnError: false
});


/**
 * Creates a standardized audit log for a user-initiated event.
 * @param {object} req - The Express request object, used to get user info and IP.
 * @param {string} eventType - A standardized, uppercase_snake_case string for the event (e.g., 'USER_LOGIN_SUCCESS').
 * @param {object} payload - A JSON object with specific details about the event.
 */
function auditLog(req, eventType, payload) {
  // Gracefully handle system events where req.user might not exist
  const userId = req.user?._id?.toString() || 'SYSTEM';
  const username = req.user?.email || 'N/A';
  
  // Use the existing Winston logger to ensure consistent format
  logger.info(`User Event: ${eventType}`, {
    eventType,
    userId,
    username,
    ip: req.ip, // Capture the user's IP address for security auditing
    payload
  });
}

module.exports = { logger, auditLog };