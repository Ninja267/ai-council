import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCouncil } from './lib/council.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const MAX_QUESTION_CHARS = Number(process.env.MAX_QUESTION_CHARS) || 2000;

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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    keysConfigured: {
      claude: Boolean(process.env.ANTHROPIC_API_KEY),
      chatgpt: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GOOGLE_API_KEY),
      grok: Boolean(process.env.XAI_API_KEY)
    }
  });
});

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
    await runCouncil(question, emit, abort.signal);
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

  console.log(`\n  AI Council listening on http://localhost:${PORT}\n`);
  if (missing.length > 0) {
    console.log('  ⚠  Missing API keys (set them in .env):');
    for (const [key, name] of missing) console.log(`     - ${key}  (${name})`);
    console.log('');
  }
});
