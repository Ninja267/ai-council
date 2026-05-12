import OpenAI from 'openai';

let client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function* streamOpenAI({ system, user, maxTokens = 600 }) {
  const stream = await getClient().chat.completions.create({
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
