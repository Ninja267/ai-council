import OpenAI from 'openai';

let envClient = null;

function getClient(apiKey) {
  if (apiKey) return new OpenAI({ apiKey });
  const envKey = process.env.OPENAI_API_KEY;
  if (!envKey) throw new Error('OPENAI_API_KEY is not set');
  if (!envClient) envClient = new OpenAI({ apiKey: envKey });
  return envClient;
}

export async function* streamOpenAI({ system, user, maxTokens = 600, apiKey }) {
  const stream = await getClient(apiKey).chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o',
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
