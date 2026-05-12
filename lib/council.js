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

function transcriptToContext(transcript) {
  if (transcript.length === 0) return '(Chưa có ai phát biểu / No one has spoken yet.)';
  return transcript
    .map(t => `### ${PERSONAS[t.id].name} (${PERSONAS[t.id].role}):\n${t.text}`)
    .join('\n\n');
}

function buildUserPrompt(stage, question, transcript) {
  const context = transcriptToContext(transcript);

  switch (stage) {
    case 'opening':
      return `Câu hỏi của người dùng / User's question:
"""
${question}
"""

NHIỆM VỤ: Bạn là chủ tọa. Hãy MỞ ĐẦU phiên Council:
1. Chào người dùng & giới thiệu phiên rất ngắn (1 câu, sống động).
2. Tóm tắt câu hỏi trong 1 câu để mọi người tập trung.
3. Mời ba thành viên (ChatGPT, Gemini, Grok) phát biểu Vòng 1.

GIỚI HẠN: TỐI ĐA 3-4 câu. Nói cùng ngôn ngữ với câu hỏi của người dùng.`;

    case 'round1':
      return `Câu hỏi của người dùng / User's question:
"""
${question}
"""

CÁC PHÁT BIỂU TRƯỚC ĐÓ / Previous turns:
${context}

NHIỆM VỤ: Đây là VÒNG 1. Hãy đưa ra LẬP TRƯỜNG / GÓC NHÌN ban đầu của bạn về câu hỏi.
- Thể hiện ĐÚNG tính cách persona của bạn.
- Có thể đồng ý hoặc phản biện những gì các thành viên đã nói trước (nếu có).
- KHÔNG kết luận thay chủ tọa.

GIỚI HẠN: 3-5 câu, ngắn như tin nhắn chat. Nói cùng ngôn ngữ với câu hỏi.`;

    case 'round2':
      return `Câu hỏi của người dùng / User's question:
"""
${question}
"""

TOÀN BỘ PHIÊN TRANH LUẬN ĐẾN GIỜ / Full debate so far:
${context}

NHIỆM VỤ: Đây là VÒNG 2 (vòng cuối trước khi chủ tọa kết luận). Hãy PHẢN BIỆN hoặc TINH CHỈNH:
- Đáp lại trực tiếp ý kiến của 1-2 thành viên khác (gọi tên họ).
- Có thể đổi ý nếu thấy ai đó thuyết phục, hoặc giữ vững lập trường và phản biện.
- Bổ sung thông tin / góc nhìn mà các thành viên khác đã bỏ sót.
- Vẫn giữ đúng tính cách persona.

GIỚI HẠN: 3-5 câu. Nói cùng ngôn ngữ với câu hỏi.`;

    case 'verdict':
      return `Câu hỏi của người dùng / User's question:
"""
${question}
"""

TOÀN BỘ PHIÊN TRANH LUẬN / Full debate transcript:
${context}

NHIỆM VỤ: Bạn là chủ tọa. Hãy đưa ra PHÁN QUYẾT CUỐI CÙNG cho người dùng:
1. Tóm tắt 1 câu các điểm đồng thuận và bất đồng giữa các thành viên.
2. Trả lời CHÍNH THỨC câu hỏi của người dùng dựa trên những gì đáng tin nhất từ phiên tranh luận.
3. Kết bằng 1 câu cảm ơn hoặc gợi ý người dùng hỏi tiếp.

GIỚI HẠN: 5-8 câu. Rõ ràng, có ích cho người dùng. Nói cùng ngôn ngữ với câu hỏi.`;

    default:
      throw new Error(`Unknown stage: ${stage}`);
  }
}

const PHASES = [
  { name: 'opening',  label: '🎬 Khai mạc / Opening' },
  { name: 'round1',   label: '🗣️ Vòng 1: Lập trường / Round 1: Positions' },
  { name: 'round2',   label: '⚔️ Vòng 2: Phản biện / Round 2: Rebuttal' },
  { name: 'verdict',  label: '⚖️ Phán quyết / Verdict' }
];

/**
 * Run the full council debate.
 *
 * @param {string} question - User question.
 * @param {(event: string, data: object) => void} emit - SSE emitter.
 * @param {AbortSignal} [signal] - To cancel if the client disconnects.
 */
export async function runCouncil(question, emit, signal) {
  const transcript = [];

  async function speak(speakerId, stage) {
    if (signal?.aborted) throw new Error('aborted');

    const persona = PERSONAS[speakerId];
    const userPrompt = buildUserPrompt(stage, question, transcript);

    emit('speaker_start', {
      id: speakerId,
      name: persona.name,
      avatar: persona.avatar,
      color: persona.color,
      role: persona.role,
      stage
    });

    let fullText = '';
    try {
      const stream = STREAMERS[speakerId]({
        system: persona.systemPrompt,
        user: userPrompt,
        maxTokens: stage === 'verdict' ? 900 : 500
      });

      for await (const chunk of stream) {
        if (signal?.aborted) throw new Error('aborted');
        fullText += chunk;
        emit('chunk', { id: speakerId, text: chunk });
      }
    } catch (err) {
      const errMsg = `[${persona.name} gặp lỗi: ${err.message}]`;
      fullText = errMsg;
      emit('chunk', { id: speakerId, text: errMsg });
    }

    emit('speaker_end', { id: speakerId });
    transcript.push({ id: speakerId, text: fullText });
  }

  // 1. Opening (chair)
  emit('phase', PHASES[0]);
  await speak(CHAIR_ID, 'opening');

  // 2. Round 1: each debater speaks in order
  emit('phase', PHASES[1]);
  for (const id of DEBATER_IDS) {
    await speak(id, 'round1');
  }

  // 3. Round 2: each debater speaks in order
  emit('phase', PHASES[2]);
  for (const id of DEBATER_IDS) {
    await speak(id, 'round2');
  }

  // 4. Verdict (chair)
  emit('phase', PHASES[3]);
  await speak(CHAIR_ID, 'verdict');

  emit('done', {});
}
