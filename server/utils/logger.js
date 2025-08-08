// server/utils/logger.js
const winston = require('winston');
const path = require('path');

// Define the path for our log file
const logFilePath = path.join(__dirname, '..', 'logs', 'app.log');

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // We'll still log to the console for immediate feedback during development
        new winston.transports.Console(),

        // NEW: Log to a rotating file
        new winston.transports.File({
            filename: logFilePath,
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ],
    exitOnError: false
});

module.exports = logger;