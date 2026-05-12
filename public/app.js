(() => {
  'use strict';

  const chat = document.getElementById('chat');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const welcome = document.getElementById('welcome');

  const STANCE_BADGE = {
    REBUT: { text: '🔥 phản biện', cls: 'badge-rebut' },
    SUPPORT: { text: '🤝 ủng hộ', cls: 'badge-support' }
  };

  let currentBubble = null;
  let isRunning = false;

  document.querySelectorAll('.example').forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = btn.textContent.trim();
      input.focus();
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isRunning) return;

    const question = input.value.trim();
    if (!question) return;

    isRunning = true;
    input.disabled = true;
    sendBtn.disabled = true;
    welcome?.remove();

    addUserMessage(question);
    input.value = '';

    try {
      await streamCouncil(question);
    } catch (err) {
      addSystemMessage('⚠️ ' + (err?.message || 'Có lỗi xảy ra. Hãy thử lại.'));
    } finally {
      isRunning = false;
      input.disabled = false;
      sendBtn.disabled = false;
      currentBubble = null;
      input.focus();
    }
  });

  async function streamCouncil(question) {
    const response = await fetch('/api/council', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ question })
    });

    if (!response.ok) {
      let detail = 'HTTP ' + response.status;
      try {
        const j = await response.json();
        if (j?.error) detail = j.error;
      } catch (_) {}
      throw new Error(detail);
    }

    if (!response.body) throw new Error('Trình duyệt không hỗ trợ streaming.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const raw of parts) {
        const parsed = parseSSE(raw);
        if (parsed) handleEvent(parsed.event, parsed.data);
      }
    }
  }

  function parseSSE(raw) {
    if (!raw || raw.startsWith(':')) return null;
    const lines = raw.split('\n');
    let event = 'message';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataStr += line.slice(6);
    }
    if (!dataStr) return null;
    try {
      return { event, data: JSON.parse(dataStr) };
    } catch {
      return null;
    }
  }

  function handleEvent(event, data) {
    switch (event) {
      case 'phase':
        addPhase(data.label);
        break;
      case 'turn_check':
        currentBubble = addThinkingBubble(data);
        break;
      case 'turn_pass':
        if (currentBubble && currentBubble.dataset.id === data.id) {
          transformToPass(currentBubble, data.reason);
        } else {
          addStandalonePass(data);
        }
        currentBubble = null;
        break;
      case 'speaker_start':
        if (
          currentBubble &&
          currentBubble.dataset.id === data.id &&
          currentBubble.classList.contains('thinking')
        ) {
          transformToSpeaking(currentBubble, data);
        } else {
          currentBubble = addBubble(data);
        }
        break;
      case 'chunk':
        if (currentBubble) appendChunk(currentBubble, data.text);
        break;
      case 'speaker_end':
        if (currentBubble) currentBubble.classList.remove('typing', 'pending');
        currentBubble = null;
        break;
      case 'error':
        addSystemMessage('⚠️ ' + data.message);
        break;
      case 'done':
        break;
    }
  }

  function scrollDown() {
    chat.scrollTop = chat.scrollHeight;
  }

  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'user-msg';
    div.textContent = text;
    chat.appendChild(div);
    scrollDown();
  }

  function addPhase(label) {
    const div = document.createElement('div');
    div.className = 'phase';
    const span = document.createElement('span');
    span.textContent = label;
    div.appendChild(span);
    chat.appendChild(div);
    scrollDown();
  }

  function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = text;
    chat.appendChild(div);
    scrollDown();
  }

  // ---- Bubble factory: builds the avatar + name-row shell. ----
  function buildBubbleShell(speaker) {
    const div = document.createElement('div');
    div.dataset.id = speaker.id;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = speaker.avatar;

    const content = document.createElement('div');
    content.className = 'bubble-content';

    const nameRow = document.createElement('div');
    nameRow.className = 'bubble-name-row';

    const name = document.createElement('span');
    name.className = 'bubble-name';
    name.textContent = speaker.name;
    nameRow.appendChild(name);

    const textBox = document.createElement('div');
    textBox.className = 'bubble-text';

    content.appendChild(nameRow);
    content.appendChild(textBox);
    div.appendChild(avatar);
    div.appendChild(content);

    return { div, nameRow, textBox };
  }

  function applyStanceBadge(nameRow, stance) {
    if (!stance || !STANCE_BADGE[stance]) return;
    // Drop any existing badge first.
    nameRow.querySelector('.stance-badge')?.remove();
    const badge = document.createElement('span');
    const conf = STANCE_BADGE[stance];
    badge.className = 'stance-badge ' + conf.cls;
    badge.textContent = conf.text;
    nameRow.appendChild(badge);
  }

  function applyStanceClass(div, stance) {
    div.classList.remove('stance-rebut', 'stance-support');
    if (stance === 'REBUT') div.classList.add('stance-rebut');
    if (stance === 'SUPPORT') div.classList.add('stance-support');
  }

  // Speaker is going to stream full content (no "thinking" phase preceded it).
  function addBubble(speaker) {
    const { div, nameRow, textBox } = buildBubbleShell(speaker);
    div.className = 'bubble typing pending';
    div.dataset.id = speaker.id;
    applyStanceClass(div, speaker.stance);
    applyStanceBadge(nameRow, speaker.stance);
    // Keep textBox referenced via class lookup later in appendChunk.
    void textBox;
    chat.appendChild(div);
    scrollDown();
    return div;
  }

  // Rounds 2-4: model is deciding. Show "đang cân nhắc..." italic bubble.
  function addThinkingBubble(speaker) {
    const { div, nameRow, textBox } = buildBubbleShell(speaker);
    div.className = 'bubble thinking';
    div.dataset.id = speaker.id;
    void nameRow;
    textBox.textContent = 'đang cân nhắc';
    const dots = document.createElement('span');
    dots.className = 'thinking-dots';
    dots.textContent = '...';
    textBox.appendChild(dots);
    chat.appendChild(div);
    scrollDown();
    return div;
  }

  // turn_pass: convert the thinking bubble into a passed-turn indicator.
  function transformToPass(bubble, reason) {
    bubble.classList.remove('thinking');
    bubble.classList.add('pass');
    const textBox = bubble.querySelector('.bubble-text');
    textBox.textContent = '';
    const passLabel = document.createElement('em');
    passLabel.textContent = 'đã bỏ qua';
    textBox.appendChild(passLabel);
    if (reason) {
      const reasonNode = document.createTextNode(' — ' + reason);
      textBox.appendChild(reasonNode);
    }
    scrollDown();
  }

  // turn_pass arriving without a preceding turn_check (shouldn't happen, but safe).
  function addStandalonePass(data) {
    const bubble = addThinkingBubble(data);
    transformToPass(bubble, data.reason);
  }

  // speaker_start after turn_check: convert the thinking bubble into a speaking one.
  function transformToSpeaking(bubble, speaker) {
    bubble.classList.remove('thinking');
    bubble.classList.add('typing', 'pending');
    const textBox = bubble.querySelector('.bubble-text');
    textBox.textContent = '';
    const nameRow = bubble.querySelector('.bubble-name-row');
    applyStanceClass(bubble, speaker.stance);
    applyStanceBadge(nameRow, speaker.stance);
    scrollDown();
  }

  function appendChunk(bubble, text) {
    if (!text) return;
    if (bubble.classList.contains('pending')) bubble.classList.remove('pending');
    const textBox = bubble.querySelector('.bubble-text');
    textBox.textContent += text;
    scrollDown();
  }
})();
