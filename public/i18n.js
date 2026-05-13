// Minimal i18n module — exposes window.AICouncilI18n.
//
// Translations live inline as plain objects. To add a new language, drop a
// new key in TRANSLATIONS (same shape) and add an <option> to the language
// selector in index.html.
//
// HTML elements opt in via data-i18n / data-i18n-placeholder / data-i18n-title /
// data-i18n-aria-label / data-i18n-html attributes. The value is the dot-path
// of the key in the translation tree. data-i18n-html allows trusted HTML
// (used for the settings hint which contains <strong> and <code>) — never
// route user input through it.

(function () {
  'use strict';

  const STORAGE_KEY = 'ai-council-lang';
  const SUPPORTED = ['vi', 'en', 'fr'];
  const DEFAULT = 'vi';

  const TRANSLATIONS = {
    vi: {
      chair: '(chủ tọa)',
      askPlaceholder: 'Hỏi Council bất cứ điều gì...',
      sendBtn: 'Hỏi',
      footnote: '4 AI · tranh luận nhiều vòng · Claude làm chủ tọa',
      welcomeTitle: 'Chào mừng đến với AI Council',
      welcomeSub: 'Đặt một câu hỏi và chứng kiến 4 AI tranh luận qua nhiều vòng để cùng đưa ra câu trả lời.',
      examples: [
        'Có nên học một ngôn ngữ lập trình mới năm 2026 không?',
        'Mèo hay chó thông minh hơn?',
        'Làm việc từ xa hay đến văn phòng tốt hơn?'
      ],
      settingsBtnLabel: 'Cài đặt',
      settingsTitle: '⚙️ Cài đặt',
      settingsHint_html: 'Keys lưu trong trình duyệt của bạn (localStorage). Server <strong>không</strong> lưu keys bạn nhập. Bỏ trống một trường sẽ dùng key từ <code>.env</code> trên server (nếu có).',
      language: 'Ngôn ngữ giao diện',
      getKey: 'Lấy key',
      testBtn: 'Test',
      testAll: 'Test tất cả',
      showKeys: 'Hiện keys',
      hideKeys: 'Ẩn keys',
      clearAll: 'Xóa hết',
      save: 'Lưu',
      closeBtn: 'Đóng',
      testing: 'đang thử…',
      testOk: '✓ OK',
      testFail: '✗',
      networkError: 'lỗi mạng',
      invalidResponse: 'phản hồi không hợp lệ',
      error: 'lỗi',
      notReadyKey: 'Chưa có key — bấm ⚙️ để nhập',
      userKey: 'Dùng key của bạn (trong trình duyệt)',
      envKey: 'Dùng key từ server (.env)',
      thinking: 'đang cân nhắc',
      passed: 'đã bỏ qua',
      requestError: '⚠️ Có lỗi xảy ra. Hãy thử lại.',
      stance: {
        REBUT: '🔥 phản biện',
        SUPPORT: '🤝 ủng hộ'
      },
      phases: {
        opening: '🎬 Khai mạc',
        round1: '🗣️ Vòng 1: Lập trường',
        round2: '⚔️ Vòng 2: Phản biện & Liên minh',
        round3: '🔥 Vòng 3: Tranh luận',
        round4: '💥 Vòng 4: Lượt cuối',
        verdict: '⚖️ Phán quyết',
        consensus: '🤝 Cả hội đồng đã thống nhất'
      },
      access: {
        title: '🔒 Truy cập',
        hint: 'Đây là deploy riêng tư. Nhập mật khẩu truy cập để dùng.',
        placeholder: 'Mật khẩu...',
        submit: 'Vào',
        wrong: 'Mật khẩu không đúng',
        signOut: 'Đăng xuất'
      }
    },

    en: {
      chair: '(chair)',
      askPlaceholder: 'Ask the Council anything…',
      sendBtn: 'Ask',
      footnote: '4 AIs · multi-round debate · Claude chairs',
      welcomeTitle: 'Welcome to the AI Council',
      welcomeSub: 'Ask a question and watch 4 AIs debate over multiple rounds to land on an answer.',
      examples: [
        'Should I learn a new programming language in 2026?',
        'Are cats or dogs smarter?',
        'Is remote work better than office work?'
      ],
      settingsBtnLabel: 'Settings',
      settingsTitle: '⚙️ Settings',
      settingsHint_html: 'Keys are stored only in your browser (localStorage). The server <strong>never</strong> persists keys you enter. Leaving a field blank falls back to the matching key in <code>.env</code> on the server (if any).',
      language: 'Interface language',
      getKey: 'Get key',
      testBtn: 'Test',
      testAll: 'Test all',
      showKeys: 'Show keys',
      hideKeys: 'Hide keys',
      clearAll: 'Clear all',
      save: 'Save',
      closeBtn: 'Close',
      testing: 'testing…',
      testOk: '✓ OK',
      testFail: '✗',
      networkError: 'network error',
      invalidResponse: 'invalid response',
      error: 'error',
      notReadyKey: 'No key — click ⚙️ to enter one',
      userKey: 'Using your key (browser)',
      envKey: 'Using server key (.env)',
      thinking: 'considering',
      passed: 'passed',
      requestError: '⚠️ Something went wrong. Please try again.',
      stance: {
        REBUT: '🔥 rebuts',
        SUPPORT: '🤝 supports'
      },
      phases: {
        opening: '🎬 Opening',
        round1: '🗣️ Round 1: Positions',
        round2: '⚔️ Round 2: Rebuttals & Alliances',
        round3: '🔥 Round 3: Debate',
        round4: '💥 Round 4: Final word',
        verdict: '⚖️ Verdict',
        consensus: '🤝 The Council reached consensus'
      },
      access: {
        title: '🔒 Access',
        hint: 'This is a private deployment. Enter the access password to continue.',
        placeholder: 'Password...',
        submit: 'Enter',
        wrong: 'Wrong password',
        signOut: 'Sign out'
      }
    },

    fr: {
      chair: '(président)',
      askPlaceholder: 'Posez une question au Conseil…',
      sendBtn: 'Demander',
      footnote: '4 IA · débat sur plusieurs tours · Claude préside',
      welcomeTitle: 'Bienvenue à l’AI Council',
      welcomeSub: 'Posez une question et regardez 4 IA débattre sur plusieurs tours pour aboutir à une réponse.',
      examples: [
        'Dois-je apprendre un nouveau langage de programmation en 2026 ?',
        'Les chats ou les chiens sont-ils plus intelligents ?',
        'Le télétravail est-il meilleur que le travail au bureau ?'
      ],
      settingsBtnLabel: 'Paramètres',
      settingsTitle: '⚙️ Paramètres',
      settingsHint_html: 'Les clés sont stockées uniquement dans votre navigateur (localStorage). Le serveur ne conserve <strong>jamais</strong> les clés que vous saisissez. Laisser un champ vide utilise la clé correspondante du <code>.env</code> côté serveur (s’il y en a une).',
      language: 'Langue de l’interface',
      getKey: 'Obtenir une clé',
      testBtn: 'Tester',
      testAll: 'Tout tester',
      showKeys: 'Afficher les clés',
      hideKeys: 'Masquer les clés',
      clearAll: 'Tout effacer',
      save: 'Enregistrer',
      closeBtn: 'Fermer',
      testing: 'test en cours…',
      testOk: '✓ OK',
      testFail: '✗',
      networkError: 'erreur réseau',
      invalidResponse: 'réponse invalide',
      error: 'erreur',
      notReadyKey: 'Aucune clé — cliquez sur ⚙️ pour en saisir une',
      userKey: 'Utilise votre clé (navigateur)',
      envKey: 'Utilise la clé du serveur (.env)',
      thinking: 'réfléchit',
      passed: 'passe son tour',
      requestError: '⚠️ Une erreur s’est produite. Veuillez réessayer.',
      stance: {
        REBUT: '🔥 réfute',
        SUPPORT: '🤝 soutient'
      },
      phases: {
        opening: '🎬 Ouverture',
        round1: '🗣️ Tour 1 : Positions',
        round2: '⚔️ Tour 2 : Réfutations & Alliances',
        round3: '🔥 Tour 3 : Débat',
        round4: '💥 Tour 4 : Derniers mots',
        verdict: '⚖️ Verdict',
        consensus: '🤝 Le Conseil a atteint un consensus'
      },
      access: {
        title: '🔒 Accès',
        hint: 'Ceci est un déploiement privé. Saisissez le mot de passe pour continuer.',
        placeholder: 'Mot de passe...',
        submit: 'Entrer',
        wrong: 'Mot de passe incorrect',
        signOut: 'Se déconnecter'
      }
    }
  };

  function detectDefaultLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (_) {}
    const browser = (navigator.language || DEFAULT).slice(0, 2).toLowerCase();
    return SUPPORTED.includes(browser) ? browser : DEFAULT;
  }

  let current = detectDefaultLang();
  const subscribers = new Set();

  function lookup(key, lang) {
    const parts = String(key).split('.');
    let obj = TRANSLATIONS[lang];
    for (const p of parts) {
      if (obj == null || typeof obj !== 'object') return undefined;
      obj = obj[p];
    }
    return obj;
  }

  function t(key) {
    const found = lookup(key, current);
    if (found !== undefined) return found;
    // Fallback chain: current → default → key itself
    const fallback = lookup(key, DEFAULT);
    return fallback !== undefined ? fallback : key;
  }

  function applyI18n(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = t(el.getAttribute('data-i18n'));
      if (typeof v === 'string') el.textContent = v;
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const v = t(el.getAttribute('data-i18n-html'));
      if (typeof v === 'string') el.innerHTML = v;
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const v = t(el.getAttribute('data-i18n-placeholder'));
      if (typeof v === 'string') el.setAttribute('placeholder', v);
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const v = t(el.getAttribute('data-i18n-title'));
      if (typeof v === 'string') el.setAttribute('title', v);
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      const v = t(el.getAttribute('data-i18n-aria-label'));
      if (typeof v === 'string') el.setAttribute('aria-label', v);
    });
    document.documentElement.lang = current;
    subscribers.forEach((fn) => {
      try { fn(current); } catch (_) {}
    });
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    applyI18n();
  }

  function getLang() { return current; }
  function supported() { return SUPPORTED.slice(); }

  // Subscribers fire after every applyI18n() — used by app.js to re-render
  // dynamic UI like the welcome examples list.
  function onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }

  window.AICouncilI18n = { t, setLang, getLang, applyI18n, onChange, supported };
})();
