import OpenAI from 'openai';

// xAI's Grok API is OpenAI-compatible; we reuse the openai SDK with a custom baseURL.
const BASE_URL = 'https://api.x.ai/v1';
let envClient = null;

function getClient(apiKey) {
  if (apiKey) return new OpenAI({ apiKey, baseURL: BASE_URL });
  const envKey = process.env.XAI_API_KEY;
  if (!envKey) throw new Error('XAI_API_KEY is not set');
  if (!envClient) envClient = new OpenAI({ apiKey: envKey, baseURL: BASE_URL });
  return envClient;
}

export async function* streamGrok({ system, user, maxTokens = 600, apiKey }) {
  const stream = await getClient(apiKey).chat.completions.create({
    model: process.env.GROK_MODEL || 'grok-4-1-fast-reasoning',
    stream: true,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  for await (const chunk of stream) {
    const text = chunk.choices?.[0]?.delta?.content;
    if (text) yield text;
  }
}

export async function testGrok({ apiKey } = {}) {
  const model = process.env.GROK_MODEL || 'grok-4-1-fast-reasoning';
  await getClient(apiKey).chat.completions.create({
    model,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'hi' }]
  });
  return { model };
}
