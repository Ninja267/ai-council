import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { runCouncil } from './lib/council.js';
import { testClaude } from './lib/providers/claude.js';
import { testOpenAI } from './lib/providers/openai.js';
import { testGemini } from './lib/providers/gemini.js';
import { testGrok } from './lib/providers/grok.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const MAX_QUESTION_CHARS = Number(process.env.MAX_QUESTION_CHARS) || 2000;
const ACCESS_PASSWORD = (process.env.ACCESS_PASSWORD || '').trim();

// Constant-time access-password check. When ACCESS_PASSWORD is not set
// the gate is disabled entirely (useful for local dev / open deployments).
function passwordMatches(provided) {
  if (!ACCESS_PASSWORD) return true;
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(ACCESS_PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requireAccess(req, res, next) {
  if (passwordMatches(req.headers['x-access-password'])) return next();
  res.status(401).json({ error: 'access_required' });
}

const app = express();
app.disable('x-powered-by');

// Security headers. Allow inline styles/scripts because our minimal frontend
// uses a single inline-free bundle, but we still keep a tight CSP.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use(express.json({ limit: '32kb' }));

// Basic rate-limit so a single client can't burn all your API credits.
app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Bạn đang hỏi nhanh quá. Thử lại sau ít giây nhé.' }
  })
);

// Access-password gate. Runs after rate-limit so wrong-password attempts still
// count against the per-IP cap. No-op when ACCESS_PASSWORD env var is unset.
app.use('/api/', requireAccess);

app.use(express.static(path.join(__dirname, 'public')));

const KEY_TESTERS = {
  anthropic: testClaude,
  openai: testOpenAI,
  google: testGemini,
  xai: testGrok
};

// Extract a readable error string from various SDK error shapes (some
// providers nest JSON inside the message).
function readableError(err) {
  let msg = err?.message || String(err);
  try {
    const m = msg.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      const inner = parsed?.error?.message;
      if (inner) {
        try {
          const innerParsed = JSON.parse(inner);
          if (innerParsed?.error?.message) return innerParsed.error.message;
        } catch (_) {}
        return inner;
      }
    }
  } catch (_) {}
  return msg.length > 300 ? msg.slice(0, 300) + '...' : msg;
}

app.post('/api/test-key', async (req, res) => {
  const provider = req.body?.provider;
  if (!provider || !KEY_TESTERS[provider]) {
    return res.status(400).json({ ok: false, error: 'invalid provider' });
  }

  const userKey = sanitizeKey(req.body?.apiKey);
  try {
    const result = await KEY_TESTERS[provider]({ apiKey: userKey });
    res.json({ ok: true, model: result?.model || null });
  } catch (err) {
    res.json({ ok: false, error: readableError(err), model: null });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    gateEnabled: Boolean(ACCESS_PASSWORD),
    keysConfigured: {
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
      chatgpt: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GOOGLE_API_KEY),
      grok: Boolean(process.env.XAI_API_KEY)
    }
  });
});

// Per-request key sanitization. Empty or non-string values fall through to
// the env-var fallback inside each provider. Keys are never persisted or logged.
const MAX_KEY_LEN = 500;
function sanitizeKey(v) {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LEN) return undefined;
  return trimmed;
}

app.post('/api/council', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';

  if (!question) {
    return res.status(400).json({ error: 'question is required' });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return res.status(413).json({
      error: `Câu hỏi quá dài (>${MAX_QUESTION_CHARS} ký tự). Hãy rút gọn lại.`
    });
  }

  const rawKeys = req.body?.keys && typeof req.body.keys === 'object' ? req.body.keys : {};
  const keys = {
    anthropic: sanitizeKey(rawKeys.anthropic),
    openai: sanitizeKey(rawKeys.openai),
    google: sanitizeKey(rawKeys.google),
    xai: sanitizeKey(rawKeys.xai)
  };

  // Server-Sent Events response.
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  const emit = (event, data) => {
    if (res.writableEnded) return;
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Heartbeat every 15s to keep the connection alive behind proxies.
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 15000);

  try {
    await runCouncil(question, emit, keys, abort.signal);
  } catch (err) {
    emit('error', { message: err?.message || 'Internal error' });
  } finally {
    clearInterval(heartbeat);
    if (!res.writableEnded) res.end();
  }
});

app.listen(PORT, () => {
  const missing = [
    ['ANTHROPIC_API_KEY', 'Claude'],
    ['OPENAI_API_KEY', 'ChatGPT'],
    ['GOOGLE_API_KEY', 'Gemini'],
    ['XAI_API_KEY', 'Grok']
  ].filter(([k]) => !process.env[k]);

  console.log(`\n  AI Council listening on http://localhost:${PORT}`);
  console.log(`  Access gate: ${ACCESS_PASSWORD ? 'ON (password required)' : 'OFF (open)'}\n`);
  if (missing.length > 0) {
    console.log('  ⚠  Missing API keys (set them in .env):');
    for (const [key, name] of missing) console.log(`     - ${key}  (${name})`);
    console.log('');
  }
});
