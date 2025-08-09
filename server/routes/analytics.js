// server/routes/analytics.js
const express = require('express');
const router = express.Router();
const esClient = require('../config/elasticsearchClient');
const logger = require('../utils/logger');

// @route   GET /api/analytics/feature-usage
// @desc    Get counts of different user activities
// @access  Admin
router.get('/feature-usage', async (req, res) => {
    if (!esClient) {
        return res.status(503).json({ message: "Analytics service is currently unavailable." });
    }

try {
    const { body } = await esClient.search({
        index: 'ai-tutor-logs-*',
        body: {
            size: 0,
            query: {
                exists: { field: "eventType" } // Look for top-level field
            },
            aggs: {
                feature_counts: {
                    terms: { field: "eventType.keyword", size: 10 } // Aggregate on top-level field
                }
            }
        }
    });
    
    logger.info('Raw Elasticsearch aggregation response', { responseBody: body });

    if (body && body.aggregations && body.aggregations.feature_counts) {
        const formattedData = body.aggregations.feature_counts.buckets.map(bucket => ({
            feature: bucket.key,
            count: bucket.doc_count
        }));
        res.json(formattedData);
    } else {
        res.json([]);
    }
} catch (error) {
        logger.error('Elasticsearch query for feature usage failed', {
            errorMessage: error.message,
            meta: error.meta?.body
        });
        res.status(500).json({ message: "Failed to retrieve feature usage analytics." });
    }
});

module.exports = router;