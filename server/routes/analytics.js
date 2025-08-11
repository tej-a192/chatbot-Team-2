// server/routes/analytics.js
const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const esClient = require('../config/elasticsearchClient');
const User = require('../models/User');
const KnowledgeSource = require('../models/KnowledgeSource');


router.get('/total-queries', async (req, res) => {
    if (!esClient) {
        return res.status(503).json({ message: "Analytics service (Elasticsearch) is currently unavailable." });
    }
    try {
        const response = await esClient.count({
            index: 'filebeat-*',
            body: {
                // --- THIS IS THE VALIDATED QUERY FROM KIBANA ---
                query: {
                    "match_phrase": {
                      "message": "User Event: CHAT_MESSAGE_SENT"
                    }
                }
            }
        });

        res.json({
            title: "Total User Queries",
            count: response.count
        });

    } catch (error) {
        logger.error('Elasticsearch query for total queries failed', { 
            errorMessage: error.message, 
            meta: error.meta?.body 
        });
        res.status(500).json({ message: "Failed to retrieve total query analytics." });
    }
});

router.get('/total-users', async (req, res) => {
    try {
        const count = await User.countDocuments();

        res.json({
            title: "Total Registered Users",
            count: count
        });

    } catch (error) {
        logger.error('MongoDB query for total users failed', { 
            errorMessage: error.message
        });
        res.status(500).json({ message: "Failed to retrieve total users analytics." });
    }
});

router.get('/active-users-today', async (req, res) => {
    if (!esClient) {
        return res.status(503).json({ message: "Analytics service (Elasticsearch) is currently unavailable." });
    }
    try {
        const response = await esClient.search({
            index: 'filebeat-*',
            body: {
                size: 0,
                query: {
                    range: {
                        "@timestamp": {
                            "gte": "now-24h/h",
                            "lte": "now/h"
                        }
                    }
                },
                aggs: {
                    unique_active_users: {
                        "cardinality": {
                            "script": {
                                "source": `
                                    if (doc.containsKey('payload') && !doc['payload'].empty) {
                                        String payload = doc['payload'].value;
                                        if (payload == null) return null;
                                        def m = /"userId":"([^"]+)"/.matcher(payload);
                                        if (m.find()) {
                                            String userId = m.group(1);
                                            if (userId != 'SYSTEM') {
                                                return userId;
                                            }
                                        }
                                    }
                                    return null;
                                `,
                                "lang": "painless"
                            }
                        }
                    }
                }
            }
        });

        const activeUserCount = response.aggregations?.unique_active_users?.value || 0;

        res.json({
            title: "Active Users (Today)",
            count: activeUserCount
        });

    } catch (error) {
        logger.error('Elasticsearch query for active users failed', { 
            errorMessage: error.message, 
            meta: error.meta?.body 
        });
        res.status(500).json({ message: "Failed to retrieve active users analytics." });
    }
});


router.get('/total-sources', async (req, res) => {
    try {
        // This query efficiently counts all documents in the KnowledgeSource collection.
        const count = await KnowledgeSource.countDocuments();

        res.json({
            title: "Total Sources Ingested",
            count: count
        });

    } catch (error) {
        logger.error('MongoDB query for total sources failed', { 
            errorMessage: error.message
        });
        res.status(500).json({ message: "Failed to retrieve total sources analytics." });
    }
});

router.get('/user-engagement', async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [totalUsers, newSignupsResponse, dailySignupsResponse] = await Promise.all([
            User.countDocuments(),
            esClient.count({
                index: 'filebeat-*',
                body: {
                    query: {
                        bool: {
                            must: [
                                // --- THIS IS THE FIX ---
                                { "match_phrase": { "message": "User Event: USER_SIGNUP_SUCCESS" } },
                                { "range": { "@timestamp": { "gte": sevenDaysAgo.toISOString() } } }
                            ]
                        }
                    }
                }
            }),
            esClient.search({
                index: 'filebeat-*',
                body: {
                    size: 0,
                    query: {
                        bool: {
                            must: [
                                // --- THIS IS THE FIX ---
                                { "match_phrase": { "message": "User Event: USER_SIGNUP_SUCCESS" } },
                                { "range": { "@timestamp": { "gte": thirtyDaysAgo.toISOString() } } }
                            ]
                        }
                    },
                    aggs: {
                        signups_over_time: {
                            date_histogram: {
                                field: "@timestamp",
                                calendar_interval: "1d",
                                min_doc_count: 0,
                                extended_bounds: {
                                    min: thirtyDaysAgo.toISOString(),
                                    max: new Date().toISOString()
                                }
                            }
                        }
                    }
                }
            })
        ]);

        const dailySignups = dailySignupsResponse.aggregations.signups_over_time.buckets.map(bucket => ({
            date: bucket.key_as_string.split('T')[0],
            count: bucket.doc_count
        }));

        res.json({
            totalUsers,
            newSignupsLast7Days: newSignupsResponse.count,
            dailySignupsLast30Days: dailySignups
        });
    } catch (error) {
        logger.error('Error fetching user engagement analytics', { errorMessage: error.message, meta: error.meta?.body });
        res.status(500).json({ message: 'Failed to retrieve user engagement analytics.' });
    }
});


router.get('/feature-usage', async (req, res) => {
    if (!esClient) {
        return res.status(503).json({ message: "Analytics service (Elasticsearch) is currently unavailable." });
    }
    try {
        const response = await esClient.search({
            index: 'filebeat-*',
            body: {
                size: 0,
                query: {
                    "wildcard": {
                        // We search inside the payload string for our event type prefix
                        "payload": "*TOOL_USAGE_*"
                    }
                },
                aggs: {
                    feature_counts: {
                        "terms": {
                            "script": {
                                // This script extracts the eventType from the payload string
                                "source": `
                                    if (doc.containsKey('payload') && !doc['payload'].empty) {
                                        def payload = doc['payload'].value;
                                        def m = /"eventType":"([^"]+)"/.matcher(payload);
                                        if (m.find()) {
                                            return m.group(1);
                                        }
                                    }
                                    return 'N/A';
                                `,
                                "lang": "painless"
                            },
                            "size": 20
                        }
                    }
                }
            }
        });

        if (response && response.aggregations && response.aggregations.feature_counts) {
            const formattedData = response.aggregations.feature_counts.buckets
                // Filter out any logs that matched the wildcard but couldn't be parsed
                .filter(bucket => bucket.key.startsWith('TOOL_USAGE_'))
                .map(bucket => ({
                    // Clean up the name for display on the chart
                    feature: bucket.key.replace('TOOL_USAGE_', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    count: bucket.doc_count
                }));
            res.json(formattedData);
        } else {
            res.json([]);
        }
    } catch (error) {
        logger.error('Elasticsearch query for feature usage failed', { errorMessage: error.message, meta: error.meta?.body });
        res.status(500).json({ message: "Failed to retrieve feature usage analytics." });
    }
});


router.get('/content-insights', async (req, res) => {
    if (!esClient) {
        return res.status(503).json({ message: "Analytics service (Elasticsearch) is currently unavailable." });
    }
    try {
        const response = await esClient.search({
            index: 'filebeat-*',
            body: {
                size: 0,
                query: {
                    "query_string": {
                        "query": "message:\"User Event: CHAT_MESSAGE_SENT\" AND payload:*documentContext* AND NOT payload:*documentContext*null*"
                    }
                },
                aggs: {
                    document_counts: {
                        "terms": {
                            "script": {
                                "source": `
                                    if (doc.containsKey('payload') && !doc['payload'].empty) {
                                        String payloadStr = doc['payload'].value;
                                        if (payloadStr == null) return 'N/A';
                                        
                                        def m = /"payload":\\{.*?"documentContext":"([^"]+)"/.matcher(payloadStr);
                                        if (m.find()) {
                                            return m.group(1);
                                        }
                                    }
                                    return 'N/A';
                                `,
                                "lang": "painless"
                            },
                            "size": 10
                        }
                    }
                }
            }
        });

        if (response && response.aggregations && response.aggregations.document_counts) {
            const formattedData = response.aggregations.document_counts.buckets
                .filter(bucket => bucket.key !== 'N/A')
                .map(bucket => ({
                    documentName: bucket.key,
                    count: bucket.doc_count
                }));
            res.json(formattedData);
        } else {
            res.json([]);
        }
    } catch (error) {
        logger.error('Elasticsearch query for content insights failed', { errorMessage: error.message, meta: error.meta?.body });
        res.status(500).json({ message: "Failed to retrieve content insights analytics." });
    }
});


router.get('/llm-usage', async (req, res) => {
    if (!esClient) {
        return res.status(503).json({ message: "Analytics service (Elasticsearch) is currently unavailable." });
    }
    try {
        const response = await esClient.search({
            index: 'filebeat-*',
            body: {
                size: 0,
                query: {
                    "query_string": {
                        "query": "message:\"User Event: CHAT_MESSAGE_SENT\" AND payload:*llmProvider*"
                    }
                },
                aggs: {
                    llm_provider_counts: {
                        "terms": {
                            "script": {
                                "source": `
                                    if (doc.containsKey('payload') && !doc['payload'].empty) {
                                        String payloadStr = doc['payload'].value;
                                        if (payloadStr == null) return 'N/A';
                                        
                                        def m = /"llmProvider":"([^"]+)"/.matcher(payloadStr);
                                        if (m.find()) {
                                            return m.group(1);
                                        }
                                    }
                                    return 'N/A';
                                `,
                                "lang": "painless"
                            },
                            "size": 10
                        }
                    }
                }
            }
        });

        if (response && response.aggregations && response.aggregations.llm_provider_counts) {
            const formattedData = response.aggregations.llm_provider_counts.buckets
                .filter(bucket => bucket.key !== 'N/A')
                .map(bucket => ({
                    provider: bucket.key,
                    count: bucket.doc_count
                }));
            res.json(formattedData);
        } else {
            res.json([]);
        }
    } catch (error) {
        logger.error('Elasticsearch query for LLM usage failed', { errorMessage: error.message, meta: error.meta?.body });
        res.status(500).json({ message: "Failed to retrieve LLM usage analytics." });
    }
});


router.get('/pptx-generated-count', async (req, res) => {
    if (!esClient) {
        return res.status(503).json({ message: "Analytics service (Elasticsearch) is currently unavailable." });
    }
    try {
        const response = await esClient.count({
            index: 'filebeat-*',
            body: {
                query: {
                    "query_string": {
                        "query": "message:*CONTENT_GENERATION* AND payload:*docType* AND payload:*pptx*"
                    }
                }
            }
        });
        res.json({ title: "PPTX Generated", count: response.count });
    } catch (error) {
        logger.error('Elasticsearch query for PPTX count failed', { errorMessage: error.message });
        res.status(500).json({ message: "Failed to retrieve PPTX generation analytics." });
    }
});

router.get('/docx-generated-count', async (req, res) => {
    if (!esClient) {
        return res.status(503).json({ message: "Analytics service (Elasticsearch) is currently unavailable." });
    }
    try {
        const response = await esClient.count({
            index: 'filebeat-*',
            body: {
                query: {
                    "query_string": {
                        "query": "message:*CONTENT_GENERATION* AND payload:*docType* AND payload:*docx*"
                    }
                }
            }
        });
        res.json({ title: "DOCX Generated", count: response.count });
    } catch (error) {
        logger.error('Elasticsearch query for DOCX count failed', { errorMessage: error.message });
        res.status(500).json({ message: "Failed to retrieve DOCX generation analytics." });
    }
});

router.get('/total-queries', async (req, res) => {
    if (!esClient) {
        return res.status(503).json({ message: "Analytics service (Elasticsearch) is currently unavailable." });
    }
    try {
        const response = await esClient.count({
            index: 'filebeat-*',
            body: {
                query: {
                    "match_phrase": {
                      "message": "User Event: CHAT_MESSAGE_SENT"
                    }
                }
            }
        });
        res.json({ title: "Total User Queries", count: response.count });
    } catch (error) {
        logger.error('Elasticsearch query for total queries failed', { errorMessage: error.message });
        res.status(500).json({ message: "Failed to retrieve total query analytics." });
    }
});


module.exports = router;