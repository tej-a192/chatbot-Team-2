// server/services/llmRouterService.js
const LLMConfiguration = require('../models/LLMConfiguration');

/**
 * Intelligently selects the best LLM for a given query and context.
 * @param {string} query - The user's query text.
 * @param {object} context - An object containing context like userId, subject, etc.
 * @returns {Promise<{chosenModel: object, logic: string}>} An object with the selected model's configuration and the reasoning for the choice.
 */
async function selectLLM(query, context) {
  const { subject } = context;
  const lowerQuery = query.toLowerCase();
  console.log(`[LLMRouter] Selecting LLM for query: "${lowerQuery.substring(0, 50)}..."`);

  // PRIORITY 1: Subject-Specific Fine-Tuned Model (for P2.8)
  // If the user has selected a subject in the UI (e.g., "Physics"), we look for a model specifically fine-tuned for it.
  if (subject) {
    const fineTunedModel = await LLMConfiguration.findOne({ subjectFocus: subject });
    if (fineTunedModel) {
      console.log(`[LLMRouter] Decision: Found specialized model '${fineTunedModel.modelId}' for subject '${subject}'.`);
      return { chosenModel: fineTunedModel, logic: 'subject_match' };
    }
  }

  // PRIORITY 2: Heuristic-based routing for specific tasks based on query keywords.

  // Logic for highly technical, math, or advanced coding tasks
  const technicalKeywords = ['calculate', 'derive', 'equation', 'theorem', 'proof', 'algorithm', 'data structure'];
  if (technicalKeywords.some(keyword => lowerQuery.includes(keyword))) {
    const techModel = await LLMConfiguration.findOne({ strengths: 'technical' });
    if (techModel) {
      console.log(`[LLMRouter] Decision: Query suggests a technical/math task. Using model '${techModel.modelId}'.`);
      return { chosenModel: techModel, logic: 'heuristic_technical' };
    }
  }
  
  // Logic for standard coding tasks
  const codeKeywords = ['code', 'python', 'javascript', 'java', 'script', 'function', 'class', 'debug'];
  if (codeKeywords.some(keyword => lowerQuery.includes(keyword))) {
     const codeModel = await LLMConfiguration.findOne({ strengths: 'code' });
     if (codeModel) {
        console.log(`[LLMRouter] Decision: Query suggests coding. Using model '${codeModel.modelId}'.`);
        return { chosenModel: codeModel, logic: 'heuristic_code' };
     }
  }

  // Logic for creative writing tasks
  const creativeKeywords = ['write a story', 'imagine', 'create a poem', 'act as a character'];
  if (creativeKeywords.some(keyword => lowerQuery.includes(keyword))) {
     const creativeModel = await LLMConfiguration.findOne({ strengths: 'creative' });
     if (creativeModel) {
        console.log(`[LLMRouter] Decision: Query suggests a creative task. Using model '${creativeModel.modelId}'.`);
        return { chosenModel: creativeModel, logic: 'heuristic_creative' };
     }
  }

  // Logic for multilingual tasks
  const multilingualKeywords = ['translate', 'in spanish', 'in french', 'in german', 'in japanese'];
  if (multilingualKeywords.some(keyword => lowerQuery.includes(keyword))) {
     const multilingualModel = await LLMConfiguration.findOne({ strengths: 'multilingual' });
     if (multilingualModel) {
        console.log(`[LLMRouter] Decision: Query suggests a multilingual task. Using model '${multilingualModel.modelId}'.`);
        return { chosenModel: multilingualModel, logic: 'heuristic_multilingual' };
     }
  }
  
  // PRIORITY 3: Fallback to the designated default model
  const defaultModel = await LLMConfiguration.findOne({ isDefault: true });
  if (defaultModel) {
    console.log(`[LLMRouter] Decision: No specific heuristic met. Using default model '${defaultModel.modelId}'.`);
    return { chosenModel: defaultModel, logic: 'default_fallback' };
  }

  // ABSOLUTE FALLBACK: In case the database is misconfigured (e.g., no default model set)
  console.error("[LLMRouter] CRITICAL: No default model configured in the database! Falling back to hardcoded default.");
  return {
    chosenModel: { modelId: 'gemini-1.5-flash-latest', provider: 'gemini' },
    logic: 'absolute_fallback'
  };
}

module.exports = { selectLLM };