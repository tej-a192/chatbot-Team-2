// server/utils/logger.js
const winston = require('winston');
const LogstashTransport = require('winston-logstash-transport').LogstashTransport;

// Define the format for our logs
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Add a timestamp
    winston.format.errors({ stack: true }), // Log the full stack trace for errors
    winston.format.json() // Output logs in JSON format
);


const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // We keep the Console transport so you can still see logs in your terminal during development
        new winston.transports.Console(),

        // ADD THIS NEW TRANSPORT
        // This will send a copy of each log to our Logstash container
        new LogstashTransport({
            host: '127.0.0.1', // Or 'logstash' if your Node.js app was also in a container
            port: 5044,
            json: true, // Ensure the message is sent as a JSON object
            // Optional: Add metadata to every log sent from this service
            meta: {
                service: 'ai-tutor-nodejs-backend',
                environment: process.env.NODE_ENV || 'development'
            }
        })
    ],
    exitOnError: false
});


// Create a stream object with a 'write' function that will be used by other modules like Morgan (optional for HTTP logging)
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    },
};

module.exports = logger;