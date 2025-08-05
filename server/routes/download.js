// server/routes/download.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

router.get('/generated-document/:filename', async (req, res) => {
    const { filename } = req.params;
    const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;

    if (!pythonServiceUrl) {
        return res.status(500).json({ message: "Download service is not configured." });
    }

    const downloadUrl = `${pythonServiceUrl}/download_document/${filename}`;
    console.log(`[Download Proxy] Streaming file from: ${downloadUrl}`);

    try {
        const response = await axios.get(downloadUrl, { responseType: 'stream' });
        // Forward the headers from the Python service to the client
        res.setHeader('Content-Disposition', response.headers['content-disposition'] || `attachment; filename=${filename}`);
        res.setHeader('Content-Type', response.headers['content-type']);
        response.data.pipe(res);
    } catch (error) {
        const errorMsg = error.response?.data?.error || (await streamToString(error.response?.data)) || error.message;
        console.error(`[Download Proxy] Error fetching from Python: ${errorMsg}`);
        res.status(error.response?.status || 500).send(errorMsg);
    }
});

// Helper to read a stream into a string, in case the Python error response is a stream
function streamToString(stream) {
    if (!stream) return Promise.resolve(null);
    const chunks = [];
    return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
        stream.on('error', err => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

module.exports = router;