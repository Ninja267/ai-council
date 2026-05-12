import { GoogleGenerativeAI } from '@google/generative-ai';

let envClient = null;

function getClient(apiKey) {
  if (apiKey) return new GoogleGenerativeAI(apiKey);
  const envKey = process.env.GOOGLE_API_KEY;
  if (!envKey) throw new Error('GOOGLE_API_KEY is not set');
  if (!envClient) envClient = new GoogleGenerativeAI(envKey);
  return envClient;
}

export async function* streamGemini({ system, user, maxTokens = 600, apiKey }) {
  const model = getClient(apiKey).getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-3.1-flash',
    systemInstruction: system,
    generationConfig: { maxOutputTokens: maxTokens }
  });

  const result = await model.generateContentStream(user);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}
