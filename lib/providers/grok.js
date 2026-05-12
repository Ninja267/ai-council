import OpenAI from 'openai';

// xAI's Grok API is OpenAI-compatible; we reuse the openai SDK with a custom baseURL.
let client = null;
function getClient() {
  if (!process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY is not set');
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: 'https://api.x.ai/v1'
    });
  }
  return client;
}

export async function* streamGrok({ system, user, maxTokens = 600 }) {
  const stream = await getClient().chat.completions.create({
    model: process.env.GROK_MODEL || 'grok-2-latest',
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
