// server/services/llmRouterService.js
const LLMConfiguration = require('../models/LLMConfiguration');

async function selectLLM(query, context) {
  // Context will contain { userId, subject, chatHistory }
  console.log(`[LLMRouter] Selecting LLM for query: "${query.substring(0, 50)}..."`);  

  // PRIORITY 1: Subject-specific model
  if (context.subject) {
    const fineTunedModel = await LLMConfiguration.findOne({ subjectFocus: context.subject });
    if (fineTunedModel) {
      console.log(`[LLMRouter] Decision: Found specialized model '${fineTunedModel.modelId}' for subject '${context.subject}'.`);
      return { chosenModel: fineTunedModel, logic: 'subject_match' }; // Return object
    }
  }

  // PRIORITY 2: Heuristic-based routing
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes('code') || lowerQuery.includes('python') || lowerQuery.includes('javascript') || lowerQuery.includes('java')) {
     const codeModel = await LLMConfiguration.findOne({ strengths: 'code' });
     if (codeModel) {
        console.log(`[LLMRouter] Decision: Query suggests coding. Using model '${codeModel.modelId}'.`);
        return { chosenModel: codeModel, logic: 'heuristic_code_detection' }; // Return object
     }
  }
  
  // PRIORITY 3: Fallback to the default model
  const defaultModel = await LLMConfiguration.findOne({ isDefault: true });
  if (defaultModel) {
    console.log(`[LLMRouter] Decision: No specific model found. Using default '${defaultModel.modelId}'.`);
    return { chosenModel: defaultModel, logic: 'default_fallback' }; // Return object
  }

  // ABSOLUTE FALLBACK
  console.error("[LLMRouter] No default model configured in the database! Falling back to hardcoded default.");
  return {
    chosenModel: { modelId: 'gemini-1.5-flash-latest', provider: 'gemini' },
    logic: 'absolute_fallback' // Return object
  };
}

module.exports = { selectLLM };