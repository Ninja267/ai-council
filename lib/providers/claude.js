import Anthropic from '@anthropic-ai/sdk';

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function* streamClaude({ system, user, maxTokens = 600 }) {
  const stream = getClient().messages.stream({
    model: process.env.CLAUDE_MODEL || 'claude-opus-4-5',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }]
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta?.type === 'text_delta' &&
      event.delta.text
    ) {
      yield event.delta.text;
    }
  }
}
