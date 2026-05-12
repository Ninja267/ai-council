import { GoogleGenAI } from '@google/genai';

let envClient = null;

function getClient(apiKey) {
  if (apiKey) return new GoogleGenAI({ apiKey });
  const envKey = process.env.GOOGLE_API_KEY;
  if (!envKey) throw new Error('GOOGLE_API_KEY is not set');
  if (!envClient) envClient = new GoogleGenAI({ apiKey: envKey });
  return envClient;
}

export async function* streamGemini({ system, user, maxTokens = 600, apiKey }) {
  const client = getClient(apiKey);
  const stream = await client.models.generateContentStream({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: user,
    config: {
      systemInstruction: system,
      maxOutputTokens: maxTokens
    }
  });

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield text;
  }
}

export async function testGemini({ apiKey } = {}) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  await getClient(apiKey).models.generateContent({
    model,
    contents: 'hi',
    config: { maxOutputTokens: 1 }
  });
  return { model };
}
