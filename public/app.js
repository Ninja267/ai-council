(() => {
  'use strict';

  const chat = document.getElementById('chat');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const welcome = document.getElementById('welcome');

  let currentBubble = null;
  let isRunning = false;

  // Wire up example buttons.
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

      // SSE messages are separated by a blank line.
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const raw of parts) {
        const parsed = parseSSE(raw);
        if (parsed) handleEvent(parsed.event, parsed.data);
      }
    }
  }

  function parseSSE(raw) {
    if (!raw || raw.startsWith(':')) return null; // heartbeat comment
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
      case 'speaker_start':
        currentBubble = addBubble(data);
        break;
      case 'chunk':
        if (currentBubble) appendChunk(currentBubble, data.text);
        break;
      case 'speaker_end':
        if (currentBubble) currentBubble.classList.remove('typing');
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

  function addBubble(speaker) {
    const div = document.createElement('div');
    div.className = 'bubble typing pending';
    div.dataset.id = speaker.id;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = speaker.avatar;

    const content = document.createElement('div');
    content.className = 'bubble-content';

    const name = document.createElement('span');
    name.className = 'bubble-name';
    name.textContent = speaker.name;

    const textBox = document.createElement('div');
    textBox.className = 'bubble-text';

    content.appendChild(name);
    content.appendChild(textBox);
    div.appendChild(avatar);
    div.appendChild(content);

    chat.appendChild(div);
    scrollDown();
    return div;
  }

  function appendChunk(bubble, text) {
    if (!text) return;
    // First chunk -> remove "pending" dots indicator.
    if (bubble.classList.contains('pending')) bubble.classList.remove('pending');
    const textBox = bubble.querySelector('.bubble-text');
    textBox.textContent += text;
    scrollDown();
  }
})();
