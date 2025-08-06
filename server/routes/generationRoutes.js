// // server/routes/generation.js
// const express = require('express');
// const axios = require('axios');
// const router = express.Router();

// // This route is protected by authMiddleware applied in server.js

// // @route   POST /api/generate/document
// // @desc    Generate a document (PPTX or DOCX) by proxying to the Python service.
// // @access  Private
// router.post('/document', async (req, res) => {
//     const { markdownContent, docType } = req.body;

//     if (!markdownContent || !docType) {
//         return res.status(400).json({ message: 'markdownContent and docType are required.' });
//     }

//     const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
//     if (!pythonServiceUrl) {
//         console.error("[Generation Route] PYTHON_RAG_SERVICE_URL is not set.");
//         return res.status(500).json({ message: "Document generation service is not configured." });
//     }

//     const generationUrl = `${pythonServiceUrl}/generate_document`;
//     console.log(`[Generation Route] Forwarding request to Python service: ${generationUrl}`);

//     try {
//         const pythonResponse = await axios.post(generationUrl, {
//             markdownContent,
//             docType
//         }, { timeout: 60000 }); // 1 minute timeout for generation

//         if (pythonResponse.data && pythonResponse.data.success) {
//             const filename = pythonResponse.data.filename;
//             // Construct the full download URL for the client
//             const downloadUrl = `${pythonServiceUrl}/download_document/${filename}`;
            
//             res.status(200).json({
//                 success: true,
//                 downloadUrl: downloadUrl,
//                 filename: filename
//             });
//         } else {
//             throw new Error(pythonResponse.data.error || "Unknown error from generation service.");
//         }
//     } catch (error) {
//         const errorMsg = error.response?.data?.error || error.message || "Failed to generate document.";
//         console.error(`[Generation Route] Error calling Python service: ${errorMsg}`);
//         res.status(500).json({ message: errorMsg });
//     }
// });

// module.exports = router;














// // server/routes/generation.js
// const express = require('express');
// const axios = require('axios');
// const router = express.Router();
// const User = require('../models/User'); // <-- Import User model

// // This route is protected by authMiddleware applied in server.js

// // @route   POST /api/generate/document
// // @desc    Generate a document (PPTX or DOCX) by proxying to the Python service.
// // @access  Private
// router.post('/document', async (req, res) => {
//     // --- MODIFIED: Destructure new fields ---
//     const { markdownContent, docType, sourceDocumentName } = req.body;
//     const userId = req.user._id;

//     if (!markdownContent || !docType || !sourceDocumentName) {
//         return res.status(400).json({ message: 'markdownContent, docType, and sourceDocumentName are required.' });
//     }

//     try {
//         // --- NEW: Fetch the full text of the source document ---
//         const user = await User.findById(userId).select('uploadedDocuments');
//         if (!user) {
//             return res.status(404).json({ message: 'User not found.' });
//         }
//         const sourceDocument = user.uploadedDocuments.find(doc => doc.filename === sourceDocumentName);
//         if (!sourceDocument || !sourceDocument.text) {
//             return res.status(404).json({ message: `Source document '${sourceDocumentName}' or its text content not found.` });
//         }
//         const sourceDocumentText = sourceDocument.text;
//         // --- END NEW ---

//         const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
//         if (!pythonServiceUrl) {
//             console.error("[Generation Route] PYTHON_RAG_SERVICE_URL is not set.");
//             return res.status(500).json({ message: "Document generation service is not configured." });
//         }

//         const generationUrl = `${pythonServiceUrl}/generate_document`;
//         console.log(`[Generation Route] Forwarding request to Python service: ${generationUrl}`);

//         const pythonResponse = await axios.post(generationUrl, {
//             markdownContent, // This is the outline (e.g., FAQ, Key Topics)
//             docType,
//             sourceDocumentText // Pass the full text for context
//         }, { timeout: 300000 }); // Increased timeout to 5 minutes for LLM generation

//         if (pythonResponse.data && pythonResponse.data.success) {
//             const filename = pythonResponse.data.filename;
//             const downloadUrl = `${pythonServiceUrl}/download_document/${filename}`;
            
//             res.status(200).json({
//                 success: true,
//                 downloadUrl: downloadUrl,
//                 filename: filename
//             });
//         } else {
//             throw new Error(pythonResponse.data.error || "Unknown error from generation service.");
//         }
//     } catch (error) {
//         const errorMsg = error.response?.data?.error || error.message || "Failed to generate document.";
//         console.error(`[Generation Route] Error: ${errorMsg}`);
//         res.status(500).json({ message: errorMsg });
//     }
// });

// module.exports = router;










// // server/routes/generation.js
// const express = require('express');
// const axios = require('axios');
// const router = express.Router();
// const User = require('../models/User');
// const AdminDocument = require('../models/AdminDocument'); // <-- Import AdminDocument model

// // This route is protected by authMiddleware applied in server.js

// // @route   POST /api/generate/document
// // @desc    Generate a document (PPTX or DOCX) by proxying to the Python service.
// // @access  Private
// router.post('/document', async (req, res) => {
//     const { markdownContent, docType, sourceDocumentName } = req.body;
//     const userId = req.user._id;

//     if (!markdownContent || !docType || !sourceDocumentName) {
//         return res.status(400).json({ message: 'markdownContent, docType, and sourceDocumentName are required.' });
//     }

//     try {
//         let sourceDocumentText = null;

//         // --- NEW UNIFIED DOCUMENT RETRIEVAL LOGIC ---
//         // 1. First, try to find the document in the user's personal documents.
//         const user = await User.findById(userId).select('uploadedDocuments');
//         if (user) {
//             const userDocument = user.uploadedDocuments.find(doc => doc.filename === sourceDocumentName);
//             if (userDocument && userDocument.text) {
//                 sourceDocumentText = userDocument.text;
//                 console.log(`[Generation Route] Found source text in user's documents for: ${sourceDocumentName}`);
//             }
//         }

//         // 2. If not found in user's docs, try to find it in the Admin documents.
//         if (!sourceDocumentText) {
//             console.log(`[Generation Route] Not found in user docs. Checking admin 'Subjects' for: ${sourceDocumentName}`);
//             const adminDocument = await AdminDocument.findOne({ originalName: sourceDocumentName }).select('text');
//             if (adminDocument && adminDocument.text) {
//                 sourceDocumentText = adminDocument.text;
//                 console.log(`[Generation Route] Found source text in admin documents for: ${sourceDocumentName}`);
//             }
//         }
//         // --- END UNIFIED LOGIC ---
        
//         // 3. If still not found after checking both, return an error.
//         if (!sourceDocumentText) {
//             return res.status(404).json({ message: `Source document '${sourceDocumentName}' not found.` });
//         }

//         const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
//         if (!pythonServiceUrl) {
//             console.error("[Generation Route] PYTHON_RAG_SERVICE_URL is not set.");
//             return res.status(500).json({ message: "Document generation service is not configured." });
//         }

//         const generationUrl = `${pythonServiceUrl}/generate_document`;
//         console.log(`[Generation Route] Forwarding request to Python service: ${generationUrl}`);

//         const pythonResponse = await axios.post(generationUrl, {
//             markdownContent,
//             docType,
//             sourceDocumentText // Pass the full text from whichever source it was found
//         }, { timeout: 300000 });

//         if (pythonResponse.data && pythonResponse.data.success) {
//             const filename = pythonResponse.data.filename;
//             const downloadUrl = `${pythonServiceUrl}/download_document/${filename}`;
            
//             res.status(200).json({
//                 success: true,
//                 downloadUrl: downloadUrl,
//                 filename: filename
//             });
//         } else {
//             throw new Error(pythonResponse.data.error || "Unknown error from generation service.");
//         }
//     } catch (error) {
//         const errorMsg = error.response?.data?.error || error.message || "Failed to generate document.";
//         console.error(`[Generation Route] Error: ${errorMsg}`);
//         res.status(500).json({ message: errorMsg });
//     }
// });

// module.exports = router;









// // server/routes/generation.js
// const express = require('express');
// const axios = require('axios');
// const router = express.Router();
// const User = require('../models/User');
// const AdminDocument = require('../models/AdminDocument');

// router.post('/document', async (req, res) => {
//     const { markdownContent, docType, sourceDocumentName } = req.body;
//     const userId = req.user._id;

//     if (!markdownContent || !docType || !sourceDocumentName) {
//         return res.status(400).json({ message: 'markdownContent, docType, and sourceDocumentName are required.' });
//     }

//     try {
//         let sourceDocumentText = null;

//         const user = await User.findById(userId).select('uploadedDocuments');
//         if (user) {
//             const userDocument = user.uploadedDocuments.find(doc => doc.filename === sourceDocumentName);
//             if (userDocument && userDocument.text) {
//                 sourceDocumentText = userDocument.text;
//             }
//         }

//         if (!sourceDocumentText) {
//             const adminDocument = await AdminDocument.findOne({ originalName: sourceDocumentName }).select('text');
//             if (adminDocument && adminDocument.text) {
//                 sourceDocumentText = adminDocument.text;
//             }
//         }
        
//         if (!sourceDocumentText) {
//             return res.status(404).json({ message: `Source document '${sourceDocumentName}' not found.` });
//         }

//         const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
//         if (!pythonServiceUrl) {
//             return res.status(500).json({ message: "Document generation service is not configured." });
//         }

//         const generationUrl = `${pythonServiceUrl}/generate_document`;
        
//         // 1. Ask Python to generate the document and get the filename
//         const genResponse = await axios.post(generationUrl, {
//             markdownContent, docType, sourceDocumentText
//         }, { timeout: 300000 });

//         if (!genResponse.data || !genResponse.data.success) {
//             throw new Error(genResponse.data.error || "Python service failed to generate the document.");
//         }

//         const filename = genResponse.data.filename;
//         const downloadUrl = `${pythonServiceUrl}/download_document/${filename}`;

//         // 2. Fetch the generated document from Python as a stream (blob)
//         console.log(`[Generation Route] Fetching generated file from Python: ${downloadUrl}`);
//         const fileResponse = await axios.get(downloadUrl, {
//             responseType: 'stream'
//         });

//         // 3. Stream the file directly back to the client
//         res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
//         res.setHeader('Content-Type', fileResponse.headers['content-type']);
//         fileResponse.data.pipe(res);

//     } catch (error) {
//         const errorMsg = error.response?.data?.error || error.message || "Failed to generate document.";
//         console.error(`[Generation Route] Error: ${errorMsg}`);
//         res.status(500).json({ message: errorMsg });
//     }
// });

// module.exports = router;

// server/routes/generation.js
const express = require('express');
const axios = require('axios');
const router = express.Router();
const User = require('../models/User'); // Still needed for API key
const AdminDocument = require('../models/AdminDocument');
const KnowledgeSource = require('../models/KnowledgeSource'); // <-- Import KnowledgeSource
const { decrypt } = require('../utils/crypto'); // For user API key

router.post('/document', async (req, res) => {
    const { markdownContent, docType, sourceDocumentName } = req.body;
    const userId = req.user._id;

    if (!markdownContent || !docType || !sourceDocumentName) {
        return res.status(400).json({ message: 'markdownContent, docType, and sourceDocumentName are required.' });
    }

    try {
        let sourceDocumentText = null;
        let apiKeyForRequest = null;

        // 1. Check user-specific KnowledgeSource and get API key
        const user = await User.findById(userId).select('+encryptedApiKey');
        const userSource = await KnowledgeSource.findOne({ userId, title: sourceDocumentName }).select('textContent').lean();
        
        if (userSource?.textContent) {
            sourceDocumentText = userSource.textContent;
            if (user?.encryptedApiKey) {
                apiKeyForRequest = decrypt(user.encryptedApiKey);
            }
        } else {
            // 2. Fallback to AdminDocument and use server key
            const adminDoc = await AdminDocument.findOne({ originalName: sourceDocumentName }).select('text').lean();
            if (adminDoc?.text) {
                sourceDocumentText = adminDoc.text;
                apiKeyForRequest = process.env.GEMINI_API_KEY;
            }
        }
        
        if (!sourceDocumentText) {
            return res.status(404).json({ message: `Source document '${sourceDocumentName}' not found.` });
        }
        if (!apiKeyForRequest) {
            return res.status(400).json({ message: "API Key for document generation is missing." });
        }

        const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
        if (!pythonServiceUrl) {
            return res.status(500).json({ message: "Document generation service is not configured." });
        }
        
        const generationUrl = `${pythonServiceUrl}/generate_document`;
        
        // Ask Python to generate the document
        const genResponse = await axios.post(generationUrl, {
            markdownContent, docType, sourceDocumentText, api_key: apiKeyForRequest
        }, { timeout: 300000 });

        if (!genResponse.data || !genResponse.data.success) {
            throw new Error(genResponse.data.error || "Python service failed to generate the document.");
        }

        const filename = genResponse.data.filename;
        const downloadUrl = `${pythonServiceUrl}/download_document/${filename}`;

        // Fetch the generated document as a stream and pipe it to the client
        const fileResponse = await axios.get(downloadUrl, { responseType: 'stream' });

        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-Type', fileResponse.headers['content-type']);
        fileResponse.data.pipe(res);

    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message || "Failed to generate document.";
        console.error(`[Generation Route] Error: ${errorMsg}`);
        res.status(error.response?.status || 500).json({ message: errorMsg });
    }
});




// ==============================================================================
// === VVV THIS IS THE ENTIRELY NEW ROUTE YOU NEED TO ADD VVV ===
// ==============================================================================
// @route   POST /api/generate/document/from-topic
// @desc    Generates a document from scratch based on a topic and proxies the download.
// @access  Private (authMiddleware is applied in server.js)
router.post('/document/from-topic', async (req, res) => {
    const { topic, docType } = req.body;
    const userId = req.user._id;

    if (!topic || !docType) {
        return res.status(400).json({ message: 'Topic and docType are required.' });
    }

    try {
        const user = await User.findById(userId).select('+encryptedApiKey');
        // Use the user's key if available, otherwise fall back to the server's global key
        const apiKeyForRequest = user?.encryptedApiKey ? decrypt(user.encryptedApiKey) : process.env.GEMINI_API_KEY;

        if (!apiKeyForRequest) {
            return res.status(400).json({ message: "API Key for document generation is missing." });
        }

        const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
        if (!pythonServiceUrl) {
            return res.status(500).json({ message: "Document generation service is not configured." });
        }
        
        const generationUrl = `${pythonServiceUrl}/generate_document_from_topic`;
        console.log(`[Node Generation] Proxying request for topic '${topic}' to Python service: ${generationUrl}`);

        // Fetch the generated document from the Python service as a stream
        const pythonResponse = await axios.post(generationUrl, {
            topic,
            docType,
            api_key: apiKeyForRequest
        }, { 
            responseType: 'stream',
            timeout: 600000 // 10 minute timeout for LLM generation and file creation
        });

        // Pipe the file stream directly back to the client.
        // The 'Content-Disposition' header from Python tells the browser the filename.
        res.setHeader('Content-Disposition', pythonResponse.headers['content-disposition']);
        res.setHeader('Content-Type', pythonResponse.headers['content-type']);
        pythonResponse.data.pipe(res);

    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message || "Failed to generate document from topic.";
        console.error(`[Node Generation] Error for topic '${topic}':`, errorMsg);
        // If headers haven't been sent yet, we can send a JSON error.
        // Otherwise, the connection will just terminate, which is acceptable for a failed stream.
        if (!res.headersSent) {
            res.status(error.response?.status || 500).json({ message: errorMsg });
        }
    }
});
// ==============================================================================
// === ^^^ END OF THE NEW ROUTE ^^^ ===
// ==============================================================================


module.exports = router;