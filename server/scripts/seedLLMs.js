// server/scripts/seedLLMs.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from the root of the 'server' directory
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Import the Mongoose model
const LLMConfiguration = require('../models/LLMConfiguration');

// --- The Seed Data ---
const llmSeedData = [
  // 1. Default & General Purpose
  {
    modelId: "gemini-1.5-flash-latest",
    provider: "gemini",
    displayName: "Gemini 1.5 Flash (Default)",
    description: "Fast and capable model for general chat, reasoning, and summarization. The best choice for most standard queries.",
    isDefault: true,
    strengths: ["chat", "reasoning", "summarization"],
    subjectFocus: null
  },
  // 2. High-Performance Reasoning & Large Context
  {
    modelId: "gemini-1.5-pro-latest",
    provider: "gemini",
    displayName: "Gemini 1.5 Pro (Deep Reasoning)",
    description: "A powerful, large-context model (1M tokens) for complex, multi-faceted reasoning and in-depth analysis of large documents.",
    isDefault: false,
    strengths: ["reasoning", "creative", "large_context"],
    subjectFocus: null
  },
  // 3. Specialized for Code Generation
  {
    modelId: "codellama:13b-instruct",
    provider: "ollama",
    displayName: "Ollama Code Llama 13B",
    description: "A highly specialized open-source model that excels at code generation, debugging, and following technical instructions.",
    isDefault: false,
    strengths: ["code"],
    subjectFocus: null
  },
  // 4. Specialized for Technical & Mathematical Tasks
  {
    modelId: "deepseek-coder:33b-instruct",
    provider: "ollama",
    displayName: "Ollama DeepSeek Coder 33B",
    description: "A top-tier open-source model renowned for its exceptional performance in coding, mathematics, and complex technical reasoning.",
    isDefault: false,
    strengths: ["technical", "code", "reasoning"],
    subjectFocus: null
  },
  // 5. Strong Open-Source All-Rounder
  {
    modelId: "llama3:8b-instruct",
    provider: "ollama",
    displayName: "Ollama Llama 3 8B",
    description: "An extremely capable and well-rounded open-source model. Excellent for general chat, creative writing, and instruction following.",
    isDefault: false,
    strengths: ["chat", "creative"],
    subjectFocus: null
  },
  // 6. Multilingual Specialist
  {
    modelId: "mistral:7b-instruct",
    provider: "ollama",
    displayName: "Ollama Mistral 7B",
    description: "A fast and efficient model known for its strong performance across multiple languages, making it ideal for translation or non-English queries.",
    isDefault: false,
    strengths: ["multilingual"],
    subjectFocus: null
  },
  // 7. Placeholder for your first fine-tuned model (for P2.8)
  {
    modelId: "fine-tuned/physics-v1-on-qwen2",
    provider: "fine-tuned",
    displayName: "Physics Expert (Qwen 2.5 Base)",
    description: "A model fine-tuned specifically on advanced physics textbooks and research papers.",
    isDefault: false,
    strengths: ["technical", "reasoning"],
    subjectFocus: "Physics"
  }
];

/**
 * Main seeder function
 */
const seedLLMConfigurations = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not found in .env file. Aborting.');
    process.exit(1);
  }

  try {
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected successfully.');

    // Find which models already exist in the database
    const existingConfigs = await LLMConfiguration.find().select('modelId').lean();
    const existingModelIds = new Set(existingConfigs.map(config => config.modelId));

    // Filter out the models that are already in the database
    const modelsToInsert = llmSeedData.filter(seed => !existingModelIds.has(seed.modelId));

    if (modelsToInsert.length === 0) {
      console.log('Database is already up-to-date. No new LLM configurations to add.');
    } else {
      console.log(`Found ${modelsToInsert.length} new LLM configurations to add.`);
      
      // Insert the new models into the database
      const inserted = await LLMConfiguration.insertMany(modelsToInsert);
      console.log('Successfully seeded the following models:');
      inserted.forEach(doc => console.log(`- ${doc.displayName} (${doc.modelId})`));
    }

    if (existingModelIds.size > 0) {
        console.log('\nSkipped the following existing models:');
        existingConfigs.forEach(doc => console.log(`- ${doc.modelId}`));
    }

  } catch (error) {
    console.error('An error occurred during the seeding process:', error);
    process.exit(1);
  } finally {
    // Ensure the database connection is always closed
    await mongoose.disconnect();
    console.log('\nMongoDB connection closed. Seeder finished.');
  }
};

seedLLMConfigurations();