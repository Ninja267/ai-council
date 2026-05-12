import { GoogleGenerativeAI } from '@google/generative-ai';

let client = null;
function getClient() {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
  }
  if (!client) client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  return client;
}

export async function* streamGemini({ system, user, maxTokens = 600 }) {
  const model = getClient().getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    systemInstruction: system,
    generationConfig: { maxOutputTokens: maxTokens }
  });

  const result = await model.generateContentStream(user);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}
