// server/config/elasticsearchClient.js
const { Client } = require('@elastic/elasticsearch');

// The Elasticsearch container is available at this address from our Node.js app
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';

let esClient;

try {
    esClient = new Client({ node: ELASTICSEARCH_URL });
    console.log("✓ Elasticsearch client configured.");
} catch (error) {
    console.error("!!! Could not create Elasticsearch client:", error);
    esClient = null;
}

module.exports = esClient;