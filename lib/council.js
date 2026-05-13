import { PERSONAS, CHAIR_ID, DEBATER_IDS } from './personas.js';
import { streamClaude } from './providers/claude.js';
import { streamOpenAI } from './providers/openai.js';
import { streamGemini } from './providers/gemini.js';
import { streamGrok } from './providers/grok.js';

const STREAMERS = {
  claude: streamClaude,
  chatgpt: streamOpenAI,
  gemini: streamGemini,
  grok: streamGrok
};

// Map speaker id → provider key name expected in the `keys` object.
const PROVIDER_KEY_NAME = {
  claude: 'anthropic',
  chatgpt: 'openai',
  gemini: 'google',
  grok: 'xai'
};

function getKey(keys, speakerId) {
  return keys?.[PROVIDER_KEY_NAME[speakerId]] || undefined;
}

const STANCE_TAG = {
  PASS: '(PASS)',
  REBUT: '(REBUTTAL)',
  SUPPORT: '(SUPPORT)'
};

function transcriptToContext(transcript) {
  if (transcript.length === 0) return '(No one has spoken yet.)';
  return transcript
    .map((t) => {
      const persona = PERSONAS[t.id];
      const tag = t.stance ? ' ' + STANCE_TAG[t.stance] : '';
      return `### ${persona.name}${tag}:\n${t.text}`;
    })
    .join('\n\n');
}

function buildOpeningPrompt(question) {
  return `The user's question:
"""
${question}
"""

YOUR TASK: As chair, OPEN the Council session:
1. Greet the user and introduce the session briefly (1 sentence, lively, in your dry-judge style).
2. Restate the question in 1 sentence — feel free to slip in a wry observation if it fits.
3. Invite the three members (ChatGPT, Gemini, Grok) to speak for Round 1.

LIMIT: 3-4 sentences max. Reply in the SAME LANGUAGE as the user's question.
REMEMBER: this session is live at a conference — ENTERTAINMENT. Stay in your dry, slightly bewildered intellectual character.`;
}

function buildRound1Prompt(question, transcript) {
  const context = transcriptToContext(transcript);
  return `The user's question:
"""
${question}
"""

PREVIOUS TURNS:
${context}

YOUR TASK: This is ROUND 1. State your INITIAL STANCE / PERSPECTIVE on the question.
- Stay IN persona — this session is for ENTERTAINMENT at a conference, the audience expects you to play your role.
- You may agree with or push back on previous speakers (if any). Dare to say something unexpected.
- Stay on-topic and offer a real perspective. Joke, but with substance.
- Do NOT deliver the final verdict — that is the chair's job.

LIMIT: 3-5 sentences, short like a chat message. Reply in the SAME LANGUAGE as the user's question.
Do NOT use [PASS]/[REBUT]/[SUPPORT] markers in this round — just write your message directly.`;
}

function buildLaterRoundPrompt(question, transcript, round) {
  const context = transcriptToContext(transcript);
  return `The user's question:
"""
${question}
"""

THE DEBATE SO FAR:
${context}

YOUR TASK: This is ROUND ${round}. Choose ONE of three actions based on how you feel about the debate so far:

  1. REBUT — you DISAGREE with someone, think someone is wrong, or have a major tension with their view.
  2. SUPPORT — you strongly AGREE with a specific member and want to REINFORCE them with a NEW argument / angle.
  3. PASS — no major disagreement, nothing new worth saying, or you already made your point and nothing has changed.

REQUIRED FORMAT — put the marker AT THE VERY START of your message, nothing before it. Choose EXACTLY one of:

[PASS] <one short sentence reason — feel free to make it funny (e.g. "Gemini was brutal enough for both of us", "agreeing for once, rare day")>

OR

[REBUT] <3-5 sentences pushing back. NAME the member you disagree with. Stay in persona — feel free to roast, say something unexpected. Reply directly.>

OR

[SUPPORT] <3-5 sentences supporting someone. NAME the member you agree with. Add a NEW argument or angle — don't just repeat them. Stay in persona; a joke is fine.>

IMPORTANT RULES:
- This is ENTERTAINMENT at a conference. The audience loves surprise and humor, but every line must have real substance.
- If you already REBUTTED/SUPPORTED in a previous round and have nothing new to add → PASS. Don't repeat yourself.
- Only speak when you have something to say. But if you have something interesting or odd to say, don't hold back.
- Reply in the SAME LANGUAGE as the user's question.`;
}

function buildVerdictPrompt(question, transcript) {
  const context = transcriptToContext(transcript);
  return `The user's question:
"""
${question}
"""

THE FULL DEBATE (note the REBUTTAL / SUPPORT / PASS tags to read alliances and disagreements):
${context}

YOUR TASK: As chair, deliver the FINAL VERDICT for the user:
1. (Optional) Open with one wry comment about the session — surprising alliances, who caused the most chaos, etc. Stay in your dry-judge character.
2. Summarize in 1-2 sentences the KEY ALLIANCES and the KEY POINTS OF DISAGREEMENT (e.g. "ChatGPT and Gemini both backed X; only Grok pushed back").
3. Officially answer the user's question — weighing multiple angles (not just majority count, but reasoning quality). THIS PART MUST BE GENUINELY USEFUL to the user. Do not hide behind jokes here.
4. Close with one line thanking the user or inviting a follow-up question, still in your style.

LIMIT: 5-9 sentences. Reply in the SAME LANGUAGE as the user's question.
Do NOT use [PASS]/[REBUT]/[SUPPORT] markers.`;
}

const ROUND_PHASES = {
  1: { name: 'round1', label: 'Round 1: Opening positions' },
  2: { name: 'round2', label: 'Round 2: Rebuttals & Alliances' },
  3: { name: 'round3', label: 'Round 3: Debate' },
  4: { name: 'round4', label: 'Round 4: Final word' }
};

// Detect [PASS] / [REBUT] / [SUPPORT] prefix at the start of a model output.
const MARKER_RE = /^\s*\[\s*(PASS|REBUT|SUPPORT)\s*\]\s*/i;
// How many leading chars to read before we give up waiting for a marker
// and fall back to treating the message as a REBUT.
const DETECT_THRESHOLD = 32;

function detectMarker(buf) {
  const m = buf.match(MARKER_RE);
  if (!m) return null;
  return { type: m[1].toUpperCase(), rest: buf.slice(m[0].length) };
}

/**
 * Run the full council debate.
 *
 * @param {string} question
 * @param {(event: string, data: object) => void} emit
 * @param {{ anthropic?: string, openai?: string, google?: string, xai?: string }} [keys]
 *        Per-request API keys. Any missing key falls back to the matching env var.
 * @param {AbortSignal} [signal]
 */
export async function runCouncil(question, emit, keys, signal) {
  const transcript = [];

  // ---- Chairperson (Claude) speaks: opening / verdict ----
  async function chairSpeak(stage, userPrompt) {
    const persona = PERSONAS[CHAIR_ID];
    emit('speaker_start', {
      id: CHAIR_ID,
      name: persona.name,
      avatar: persona.avatar,
      color: persona.color,
      role: persona.role,
      stage,
      stance: null
    });

    let full = '';
    try {
      const stream = STREAMERS[CHAIR_ID]({
        system: persona.systemPrompt,
        user: userPrompt,
        maxTokens: stage === 'verdict' ? 900 : 500,
        apiKey: getKey(keys, CHAIR_ID)
      });
      for await (const chunk of stream) {
        if (signal?.aborted) throw new Error('aborted');
        full += chunk;
        emit('chunk', { id: CHAIR_ID, text: chunk });
      }
    } catch (err) {
      const msg = `[${persona.name} error: ${err.message}]`;
      full = msg;
      emit('chunk', { id: CHAIR_ID, text: msg });
    }
    emit('speaker_end', { id: CHAIR_ID });
    transcript.push({ id: CHAIR_ID, text: full.trim(), stance: null });
  }

  // ---- Round 1: every debater MUST speak (no marker) ----
  async function speakRound1(id) {
    const persona = PERSONAS[id];
    const userPrompt = buildRound1Prompt(question, transcript);

    emit('speaker_start', {
      id,
      name: persona.name,
      avatar: persona.avatar,
      color: persona.color,
      role: persona.role,
      stage: 'round1',
      stance: null
    });

    let full = '';
    try {
      const stream = STREAMERS[id]({
        system: persona.systemPrompt,
        user: userPrompt,
        maxTokens: 500,
        apiKey: getKey(keys, id)
      });
      for await (const chunk of stream) {
        if (signal?.aborted) throw new Error('aborted');
        full += chunk;
        emit('chunk', { id, text: chunk });
      }
    } catch (err) {
      const msg = `[${persona.name} error: ${err.message}]`;
      full = msg;
      emit('chunk', { id, text: msg });
    }
    emit('speaker_end', { id });
    transcript.push({ id, text: full.trim(), stance: null });
  }

  // ---- Rounds 2-4: debater decides PASS / REBUT / SUPPORT ----
  async function decideAndSpeak(id, round) {
    const persona = PERSONAS[id];
    const userPrompt = buildLaterRoundPrompt(question, transcript, round);

    emit('turn_check', {
      id,
      name: persona.name,
      avatar: persona.avatar,
      color: persona.color,
      role: persona.role,
      stage: `round${round}`
    });

    let buffer = '';
    let phase = 'detecting'; // 'detecting' | 'speaking' | 'collecting-pass'
    let stance = null;
    let body = '';

    function startSpeakingBubble() {
      emit('speaker_start', {
        id,
        name: persona.name,
        avatar: persona.avatar,
        color: persona.color,
        role: persona.role,
        stage: `round${round}`,
        stance
      });
      if (body) emit('chunk', { id, text: body });
    }

    try {
      const stream = STREAMERS[id]({
        system: persona.systemPrompt,
        user: userPrompt,
        maxTokens: 500,
        apiKey: getKey(keys, id)
      });

      for await (const chunk of stream) {
        if (signal?.aborted) throw new Error('aborted');

        if (phase === 'detecting') {
          buffer += chunk;
          const marker = detectMarker(buffer);
          if (marker) {
            stance = marker.type;
            body = marker.rest;
            if (stance === 'PASS') {
              phase = 'collecting-pass';
            } else {
              phase = 'speaking';
              startSpeakingBubble();
            }
            continue;
          }
          // Fallback: model didn't follow format. Treat as a (slightly louder) REBUT.
          if (buffer.trimStart().length >= DETECT_THRESHOLD) {
            stance = 'REBUT';
            body = buffer.trimStart();
            phase = 'speaking';
            startSpeakingBubble();
          }
        } else if (phase === 'speaking') {
          body += chunk;
          emit('chunk', { id, text: chunk });
        } else if (phase === 'collecting-pass') {
          body += chunk;
        }
      }

      // Stream ended while we were still detecting (very short output).
      if (phase === 'detecting') {
        const trimmed = buffer.trim();
        if (trimmed.length > 0) {
          stance = 'REBUT';
          body = trimmed;
          phase = 'speaking';
          startSpeakingBubble();
        } else {
          stance = 'PASS';
          body = '(no response)';
          phase = 'collecting-pass';
        }
      }
    } catch (err) {
      const errStr = `[${persona.name} error: ${err.message}]`;
      if (phase === 'detecting') {
        stance = 'REBUT';
        body = errStr;
        startSpeakingBubble();
        phase = 'speaking';
      } else if (phase === 'speaking') {
        body += errStr;
        emit('chunk', { id, text: errStr });
      } else {
        body = errStr;
      }
    }

    if (stance === 'PASS') {
      emit('turn_pass', { id, name: persona.name, reason: body.trim() });
      transcript.push({ id, text: body.trim(), stance: 'PASS' });
      return false;
    }
    emit('speaker_end', { id });
    transcript.push({ id, text: body.trim(), stance });
    return true;
  }

  // 1. Opening
  emit('phase', { name: 'opening', label: 'Opening' });
  await chairSpeak('opening', buildOpeningPrompt(question));

  // 2. Round 1 — mandatory for every debater
  emit('phase', ROUND_PHASES[1]);
  for (const id of DEBATER_IDS) {
    await speakRound1(id);
  }

  // 3. Rounds 2-4 — each debater decides PASS / REBUT / SUPPORT.
  //    If a whole round goes by with everyone passing, we end early.
  for (let round = 2; round <= 4; round++) {
    emit('phase', ROUND_PHASES[round]);
    let anySpoke = false;
    for (const id of DEBATER_IDS) {
      const spoke = await decideAndSpeak(id, round);
      if (spoke) anySpoke = true;
    }
    if (!anySpoke) {
      emit('phase', { name: 'consensus', label: 'Council reached consensus' });
      break;
    }
  }

  // 4. Verdict
  emit('phase', { name: 'verdict', label: 'Verdict' });
  await chairSpeak('verdict', buildVerdictPrompt(question, transcript));

  emit('done', {});
}
