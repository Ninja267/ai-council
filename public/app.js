(() => {
  'use strict';

  const i18n = window.AICouncilI18n;
  const t = (k) => i18n.t(k);

  const chat = document.getElementById('chat');
  const form = document.getElementById('form');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const welcome = document.getElementById('welcome');

  // ---- Settings / API keys (stored only in this browser) ----
  const KEYS_STORAGE_KEY = 'ai-council-keys-v1';
  const PROVIDERS = ['anthropic', 'openai', 'google', 'xai'];

  const settingsModal = document.getElementById('settings-modal');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsClose = document.getElementById('settings-close');
  const settingsBackdrop = document.getElementById('settings-backdrop');
  const settingsSave = document.getElementById('settings-save');
  const settingsClear = document.getElementById('settings-clear');
  const settingsShowToggle = document.getElementById('settings-show-toggle');
  const keyInputs = Object.fromEntries(
    PROVIDERS.map((p) => [p, document.getElementById('key-' + p)])
  );

  let envConfigured = { anthropic: false, openai: false, google: false, xai: false };
  let keysVisible = false;

  function loadKeysFromStorage() {
    try {
      const raw = localStorage.getItem(KEYS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveKeysToStorage(keys) {
    try {
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
    } catch {
      /* localStorage disabled — ignore */
    }
  }

  function clearKeysFromStorage() {
    try {
      localStorage.removeItem(KEYS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  function currentKeys() {
    const stored = loadKeysFromStorage();
    const out = {};
    for (const p of PROVIDERS) out[p] = stored[p] || '';
    return out;
  }

  function updateStatusDots() {
    const stored = loadKeysFromStorage();
    document.querySelectorAll('.chip[data-key-for]').forEach((chip) => {
      const provider = chip.dataset.keyFor;
      const hasUserKey = Boolean(stored[provider]);
      const hasEnvKey = Boolean(envConfigured[provider]);
      const hasAny = hasUserKey || hasEnvKey;
      const dot = chip.querySelector('.status-dot');
      if (dot) dot.dataset.status = hasAny ? 'on' : 'off';
      chip.title = !hasAny
        ? t('notReadyKey')
        : hasUserKey
        ? t('userKey')
        : t('envKey');
    });
  }

  async function fetchHealth() {
    try {
      const r = await fetch('/api/health');
      if (!r.ok) return;
      const j = await r.json();
      const k = j?.keysConfigured || {};
      envConfigured = {
        anthropic: !!k.claude,
        openai:    !!k.chatgpt,
        google:    !!k.gemini,
        xai:       !!k.grok
      };
    } catch {
      /* ignore — keep dots based on local keys only */
    }
    updateStatusDots();
  }

  function openSettings() {
    const k = currentKeys();
    for (const p of PROVIDERS) {
      keyInputs[p].value = k[p];
      keyInputs[p].type = keysVisible ? 'text' : 'password';
    }
    settingsModal.hidden = false;
    settingsModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => keyInputs.anthropic?.focus(), 30);
  }

  function closeSettings() {
    settingsModal.hidden = true;
    settingsModal.setAttribute('aria-hidden', 'true');
  }

  settingsBtn?.addEventListener('click', openSettings);
  settingsClose?.addEventListener('click', closeSettings);
  settingsBackdrop?.addEventListener('click', closeSettings);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !settingsModal.hidden) closeSettings();
  });

  settingsSave?.addEventListener('click', () => {
    const toSave = {};
    for (const p of PROVIDERS) {
      const v = (keyInputs[p].value || '').trim();
      if (v) toSave[p] = v;
    }
    if (Object.keys(toSave).length === 0) clearKeysFromStorage();
    else saveKeysToStorage(toSave);
    updateStatusDots();
    closeSettings();
  });

  settingsClear?.addEventListener('click', () => {
    for (const p of PROVIDERS) keyInputs[p].value = '';
    clearKeysFromStorage();
    updateStatusDots();
  });

  settingsShowToggle?.addEventListener('click', () => {
    keysVisible = !keysVisible;
    for (const p of PROVIDERS) keyInputs[p].type = keysVisible ? 'text' : 'password';
    settingsShowToggle.textContent = keysVisible ? t('hideKeys') : t('showKeys');
  });

  // ---- Test key buttons ----
  async function testKey(provider) {
    const btn = document.querySelector(`.key-test-btn[data-test="${provider}"]`);
    const resultDiv = document.querySelector(`.key-test-result[data-result-for="${provider}"]`);
    if (!btn || !resultDiv) return;

    const apiKey = (keyInputs[provider]?.value || '').trim();
    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = '...';
    resultDiv.className = 'key-test-result loading';
    resultDiv.textContent = t('testing');

    try {
      const r = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey })
      });
      const j = await r.json().catch(() => ({ ok: false, error: t('invalidResponse') }));

      if (j.ok) {
        resultDiv.className = 'key-test-result ok';
        resultDiv.textContent = `${t('testOk')}${j.model ? ` — model: ${j.model}` : ''}`;
      } else {
        resultDiv.className = 'key-test-result fail';
        resultDiv.textContent = `${t('testFail')} ${j.error || t('error')}`;
      }
    } catch (err) {
      resultDiv.className = 'key-test-result fail';
      resultDiv.textContent = `${t('testFail')} ` + (err?.message || t('networkError'));
    } finally {
      btn.disabled = false;
      btn.textContent = prevLabel;
    }
  }

  document.querySelectorAll('.key-test-btn').forEach((btn) => {
    btn.addEventListener('click', () => testKey(btn.dataset.test));
  });

  document.getElementById('settings-test-all')?.addEventListener('click', async () => {
    for (const p of PROVIDERS) {
      await testKey(p);
    }
  });

  // ---- Language selector ----
  const langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.value = i18n.getLang();
    langSelect.addEventListener('change', () => i18n.setLang(langSelect.value));
  }

  // ---- Welcome examples (rendered from translations) ----
  const examplesContainer = document.querySelector('.examples');
  function renderExamples() {
    if (!examplesContainer) return;
    examplesContainer.textContent = '';
    const items = t('examples');
    if (!Array.isArray(items)) return;
    for (const text of items) {
      const btn = document.createElement('button');
      btn.className = 'example';
      btn.type = 'button';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        input.value = text;
        input.focus();
      });
      examplesContainer.appendChild(btn);
    }
  }

  // Initial i18n pass — applies static [data-i18n*] markers across the DOM —
  // and a subscription so any future setLang() re-renders dynamic UI too.
  i18n.applyI18n();
  renderExamples();
  i18n.onChange(() => {
    renderExamples();
    // Re-sync the show/hide-keys toggle since its label depends on UI state,
    // not a static data-i18n attribute.
    if (settingsShowToggle) {
      settingsShowToggle.textContent = keysVisible ? t('hideKeys') : t('showKeys');
    }
    updateStatusDots();
  });

  fetchHealth();

  let currentBubble = null;
  let isRunning = false;

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
      addSystemMessage(err?.message ? '⚠️ ' + err.message : t('requestError'));
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
      body: JSON.stringify({ question, keys: currentKeys() })
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
        // Intentionally NOT rendered: round titles break the illusion of a
        // natural group chat. The server still emits them so the backend
        // can keep its state machine clean.
        break;
      case 'turn_check':
        currentBubble = addThinkingBubble(data);
        break;
      case 'turn_pass':
        // Silent skip: someone who "thought about it then said nothing" should
        // leave no trace in the conversation, just like in a real group chat.
        if (currentBubble && currentBubble.dataset.id === data.id) {
          currentBubble.remove();
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

  // Speaker is going to stream full content (no "thinking" phase preceded it).
  function addBubble(speaker) {
    const { div, nameRow, textBox } = buildBubbleShell(speaker);
    div.className = 'bubble typing pending';
    div.dataset.id = speaker.id;
    // No stance badges or accents — we want the conversation to feel like
    // a natural group chat, not a debate scoreboard. The model's own words
    // convey its position.
    void nameRow;
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
    textBox.textContent = t('thinking');
    const dots = document.createElement('span');
    dots.className = 'thinking-dots';
    dots.textContent = '...';
    textBox.appendChild(dots);
    chat.appendChild(div);
    scrollDown();
    return div;
  }

  // speaker_start after turn_check: convert the thinking bubble into a speaking one.
  function transformToSpeaking(bubble) {
    bubble.classList.remove('thinking');
    bubble.classList.add('typing', 'pending');
    const textBox = bubble.querySelector('.bubble-text');
    textBox.textContent = '';
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
