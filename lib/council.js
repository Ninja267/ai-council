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

const STANCE_TAG_VI = {
  PASS: '(BỎ QUA)',
  REBUT: '(PHẢN BIỆN)',
  SUPPORT: '(ỦNG HỘ)'
};

function transcriptToContext(transcript) {
  if (transcript.length === 0) return '(Chưa có ai phát biểu / No one has spoken yet.)';
  return transcript
    .map((t) => {
      const persona = PERSONAS[t.id];
      const tag = t.stance ? ' ' + STANCE_TAG_VI[t.stance] : '';
      return `### ${persona.name}${tag}:\n${t.text}`;
    })
    .join('\n\n');
}

function buildOpeningPrompt(question) {
  return `Câu hỏi của người dùng / User's question:
"""
${question}
"""

NHIỆM VỤ: Bạn là chủ tọa. Hãy MỞ ĐẦU phiên Council:
1. Chào người dùng & giới thiệu phiên rất ngắn (1 câu, sống động, đậm chất "thẩm phán hơi quái").
2. Tóm tắt câu hỏi trong 1 câu — có thể kèm một nhận xét xéo nhẹ về câu hỏi nếu hợp.
3. Mời ba thành viên (ChatGPT, Gemini, Grok) phát biểu Vòng 1.

GIỚI HẠN: TỐI ĐA 3-4 câu. Cùng ngôn ngữ với câu hỏi.
GHI NHỚ: phiên đang phát tại hội thảo — đây là ENTERTAINMENT. Thể hiện đúng tính cách hài hước khô khốc của bạn.`;
}

function buildRound1Prompt(question, transcript) {
  const context = transcriptToContext(transcript);
  return `Câu hỏi của người dùng / User's question:
"""
${question}
"""

CÁC PHÁT BIỂU TRƯỚC ĐÓ / Previous turns:
${context}

NHIỆM VỤ: Đây là VÒNG 1. Hãy đưa ra LẬP TRƯỜNG / GÓC NHÌN ban đầu của bạn về câu hỏi.
- Thể hiện ĐÚNG tính cách persona — phiên này dùng cho GIẢI TRÍ tại hội thảo, khán giả mong bạn vào vai.
- Có thể đồng ý hoặc phản biện những gì các thành viên đã nói (nếu có). Dám nói điều bất ngờ.
- Vẫn phải bám câu hỏi và đưa được góc nhìn thực chất. Đùa nhưng có nội dung.
- KHÔNG kết luận thay chủ tọa.

GIỚI HẠN: 3-5 câu, ngắn như tin nhắn chat. Cùng ngôn ngữ với câu hỏi.
KHÔNG dùng marker [PASS]/[REBUT]/[SUPPORT] ở vòng này — chỉ viết nội dung tin nhắn.`;
}

function buildLaterRoundPrompt(question, transcript, round) {
  const context = transcriptToContext(transcript);
  return `Câu hỏi của người dùng / User's question:
"""
${question}
"""

TOÀN BỘ PHIÊN TRANH LUẬN ĐẾN GIỜ:
${context}

NHIỆM VỤ: Đây là VÒNG ${round}. Bạn được phép CHỌN một trong ba hành động dựa trên cảm nhận của bạn về phiên đến giờ:

  1. PHẢN BIỆN (REBUT) — bạn KHÔNG ĐỒNG Ý với ai đó, thấy ai đó nói sai, hoặc có mâu thuẫn lớn với quan điểm của bạn.
  2. ỦNG HỘ (SUPPORT) — bạn rất ĐỒNG TÌNH với một thành viên cụ thể và muốn TĂNG TRỌNG LƯỢNG cho họ bằng cách bổ sung lý lẽ / góc nhìn mới.
  3. BỎ QUA (PASS) — không mâu thuẫn lớn, không có gì mới đáng nói, hoặc bạn đã nói rồi và quan điểm chưa thay đổi.

FORMAT BẮT BUỘC — đặt marker NGAY ĐẦU tin nhắn, KHÔNG có ký tự nào trước nó. Chọn ĐÚNG 1 trong 3:

[PASS] <1 câu ngắn lý do bạn bỏ qua — có thể hài hước (vd: "Gemini đã phũ thay tôi rồi", "đồng tình, hiếm khi vậy")>

HOẶC

[REBUT] <3-5 câu phản biện. GỌI TÊN người bạn không đồng ý. Đúng tính cách persona — DÁM cà khịa, dám nói điều bất ngờ. Đáp trực tiếp.>

HOẶC

[SUPPORT] <3-5 câu ủng hộ. GỌI TÊN người bạn đồng tình. Bổ sung lý lẽ MỚI giúp củng cố quan điểm của họ — không lặp lại. Đúng tính cách persona, có thể kèm một câu đùa.>

QUY TẮC QUAN TRỌNG:
- Phiên này dùng cho GIẢI TRÍ tại hội thảo. Khán giả thích sự bất ngờ và hài hước, nhưng câu nói vẫn phải có nội dung thực.
- Nếu vòng trước bạn đã PHẢN BIỆN/ỦNG HỘ và không có ý mới → BỎ QUA. Đừng lặp lại.
- Chỉ lên tiếng khi thật sự có gì đáng nói. Nhưng nếu có gì hay/lạ để nói — đừng nhịn.
- Cùng ngôn ngữ với câu hỏi của người dùng.`;
}

function buildVerdictPrompt(question, transcript) {
  const context = transcriptToContext(transcript);
  return `Câu hỏi của người dùng / User's question:
"""
${question}
"""

TOÀN BỘ PHIÊN TRANH LUẬN (chú ý các nhãn PHẢN BIỆN / ỦNG HỘ / BỎ QUA để hiểu liên minh và bất đồng):
${context}

NHIỆM VỤ: Bạn là chủ tọa. Hãy đưa ra PHÁN QUYẾT CUỐI CÙNG:
1. (Có thể) Mở bằng 1 câu nhận xét xéo/hài hước về diễn biến phiên — ví dụ liên minh bất ngờ, ai phá nhiều nhất, v.v. Giữ đúng kiểu thẩm phán khô khốc của bạn.
2. Tóm tắt 1-2 câu các LIÊN MINH ỦNG HỘ và CÁC ĐIỂM PHẢN BIỆN chính (vd: "ChatGPT và Gemini đều ủng hộ X, chỉ Grok phản biện").
3. Trả lời CHÍNH THỨC câu hỏi của người dùng — cân nhắc đa chiều (không chỉ chiều đông), chất lượng lý lẽ. PHẦN NÀY PHẢI HỮU ÍCH THỰC SỰ cho user, không được lảng tránh bằng đùa.
4. Kết bằng 1 câu cảm ơn / mời hỏi tiếp, vẫn đúng phong cách của bạn.

GIỚI HẠN: 5-9 câu. Cùng ngôn ngữ với câu hỏi.
KHÔNG dùng marker [PASS]/[REBUT]/[SUPPORT].`;
}

const ROUND_PHASES = {
  1: { name: 'round1', label: '🗣️ Vòng 1: Lập trường / Round 1: Positions' },
  2: { name: 'round2', label: '⚔️ Vòng 2: Phản biện & Liên minh / Round 2' },
  3: { name: 'round3', label: '🔥 Vòng 3: Tranh luận / Round 3' },
  4: { name: 'round4', label: '💥 Vòng 4: Lượt cuối / Round 4: Final word' }
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
      const msg = `[${persona.name} gặp lỗi: ${err.message}]`;
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
      const msg = `[${persona.name} gặp lỗi: ${err.message}]`;
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
          body = '(không phản hồi)';
          phase = 'collecting-pass';
        }
      }
    } catch (err) {
      const errStr = `[${persona.name} gặp lỗi: ${err.message}]`;
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
  emit('phase', { name: 'opening', label: '🎬 Khai mạc / Opening' });
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
      emit('phase', { name: 'consensus', label: '🤝 Cả hội đồng đã thống nhất / Council reached consensus' });
      break;
    }
  }

  // 4. Verdict
  emit('phase', { name: 'verdict', label: '⚖️ Phán quyết / Verdict' });
  await chairSpeak('verdict', buildVerdictPrompt(question, transcript));

  emit('done', {});
}
