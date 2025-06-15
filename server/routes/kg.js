// server/routes/kg.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');
const AdminDocument = require('../models/AdminDocument'); // For checking admin docs

// Note: authMiddleware will be applied to this router in server.js

// @route   GET /api/kg/visualize/:documentName
// @desc    Get knowledge graph data for a specific document for visualization.
// @access  Private
router.get('/visualize/:documentName', async (req, res) => {
    const { documentName } = req.params;
    const currentUserId = req.user._id.toString();

    if (!documentName) {
        return res.status(400).json({ message: 'Document name is required.' });
    }

    try {
        let targetUserIdForKg = null; // This will hold the ID used to query the Python service

        // 1. Check if it's an admin document ("Subject")
        const isAdminDoc = await AdminDocument.exists({ originalName: documentName });

        if (isAdminDoc) {
            // Admin docs are stored under a generic ID in the Python service's Neo4j handler.
            targetUserIdForKg = "fixed_admin_id_marker"; 
            console.log(`[KG Visualize] Request for admin subject '${documentName}'. Using generic admin ID for KG lookup.`);
        } else {
            // 2. If not an admin doc, check if it belongs to the current user.
            const user = await User.exists({ _id: currentUserId, "uploadedDocuments.filename": documentName });
            if (user) {
                targetUserIdForKg = currentUserId;
                console.log(`[KG Visualize] Request for user document '${documentName}'. Using user's ID for KG lookup.`);
            }
        }
        
        // 3. If the document doesn't exist as an admin subject or for the current user, deny access.
        if (!targetUserIdForKg) {
            console.warn(`[KG Visualize] User ${currentUserId} requested unauthorized or non-existent KG for document: ${documentName}`);
            return res.status(403).json({ message: 'Access denied or knowledge graph not found for this document.' });
        }
        
        const pythonServiceUrl = process.env.PYTHON_RAG_SERVICE_URL;
        if (!pythonServiceUrl) {
            return res.status(500).json({ message: "Knowledge Graph service is not configured." });
        }
        
        // 4. Call the Python service with the correct user ID (either the actual user's or the generic admin's)
        const getKgUrl = `${pythonServiceUrl}/kg/${targetUserIdForKg}/${encodeURIComponent(documentName)}`;
        
        console.log(`[KG Visualize] Proxying request to Python service: ${getKgUrl}`);
        
        const pythonResponse = await axios.get(getKgUrl, { timeout: 30000 });

        if (pythonResponse.data && pythonResponse.data.nodes) {
            res.status(200).json(pythonResponse.data);
        } else {
            res.status(404).json({ message: `Knowledge graph for '${documentName}' not found or is empty.` });
        }
    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message || "Failed to retrieve knowledge graph.";
        console.error(`[KG Visualize] Error proxying KG request for '${documentName}': ${errorMsg}`);
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json({ message: errorMsg });
    }
});

module.exports = router;
