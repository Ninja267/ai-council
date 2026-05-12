import Anthropic from '@anthropic-ai/sdk';

// One global client reused for env-based requests (lightweight reuse).
let envClient = null;

function getClient(apiKey) {
  if (apiKey) {
    // Per-request client when the caller provides their own key.
    return new Anthropic({ apiKey });
  }
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (!envKey) throw new Error('ANTHROPIC_API_KEY is not set');
  if (!envClient) envClient = new Anthropic({ apiKey: envKey });
  return envClient;
}

export async function* streamClaude({ system, user, maxTokens = 600, apiKey }) {
  const stream = getClient(apiKey).messages.stream({
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
