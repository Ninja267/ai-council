# AI Council ⚖️

Một web chat đơn giản, nơi **4 mô hình AI tranh luận** với nhau theo phong cách
một phiên Council sống động (giống cửa sổ chat nhóm trên Messenger) để cùng trả
lời câu hỏi của bạn.

- **Claude** 🎩 - chủ tọa (Chairperson), điềm tĩnh, công bằng
- **ChatGPT** 🤓 - thầy giáo cẩn trọng, thiên về consensus
- **Gemini** 💎 - thực dụng, data-driven, lạnh lùng
- **Grok** 😏 - contrarian, cà khịa, dám nói điều phũ

Mỗi câu hỏi đi qua 4 giai đoạn:

1. **Khai mạc** - Claude mở phiên
2. **Vòng 1: Lập trường** - ChatGPT, Gemini, Grok lần lượt đưa quan điểm
3. **Vòng 2: Phản biện** - 3 thành viên phản biện / tinh chỉnh
4. **Phán quyết** - Claude tổng hợp & trả lời chính thức

Tất cả các bước được **stream theo thời gian thực** (Server-Sent Events) để
bạn thấy từng tin nhắn được "gõ" ra như chat nhóm thật.

---

## Stack

- **Backend:** Node.js 20+ với Express, helmet, express-rate-limit
- **Frontend:** HTML / CSS / JS vanilla, không framework
- **Providers:** `@anthropic-ai/sdk`, `openai` (cho cả OpenAI và xAI Grok),
  `@google/generative-ai`

---

## Cài đặt

```bash
# 1. Clone & cài deps
git clone <repo-url> ai-council
cd ai-council
npm install

# 2. Cấu hình API keys
cp .env.example .env
# Mở .env và điền 4 API keys:
#   ANTHROPIC_API_KEY  (https://console.anthropic.com/)
#   OPENAI_API_KEY     (https://platform.openai.com/)
#   GOOGLE_API_KEY     (https://aistudio.google.com/)
#   XAI_API_KEY        (https://console.x.ai/)

# 3. Chạy
npm start
# Mở http://localhost:3000
```

---

## Cấu trúc dự án

```
ai-council/
├── server.js              # Express + SSE endpoint
├── lib/
│   ├── council.js         # Orchestrator: 4 phases, 2 rounds
│   ├── personas.js        # Persona/system prompt cho từng model
│   └── providers/
│       ├── claude.js      # Anthropic SDK streaming
│       ├── openai.js      # OpenAI SDK streaming
│       ├── gemini.js      # Google GenAI SDK streaming
│       └── grok.js        # xAI (OpenAI-compatible) streaming
├── public/
│   ├── index.html         # Frontend
│   ├── style.css          # Messenger-style UI
│   └── app.js             # SSE client + render
├── .env.example           # Template (commit được)
└── .env                   # KHÔNG commit (đã ignore)
```

---

## Bảo mật

- `.env` được liệt kê trong `.gitignore` - **không bao giờ commit** API keys.
- Helmet đặt các security header chuẩn (CSP, X-Frame-Options, …).
- Rate-limit: 10 request / phút / IP cho `/api/*`.
- Body JSON limit 32kb, câu hỏi tối đa 2000 ký tự (cấu hình qua `MAX_QUESTION_CHARS`).
- Tất cả output từ AI được render qua `textContent` (no innerHTML) - tránh XSS.
- Không log câu hỏi hay câu trả lời ra console / file.

---

## Tuỳ chỉnh

**Đổi model:** sửa các biến `*_MODEL` trong `.env`. Ví dụ dùng `gpt-4o-mini`
cho rẻ hơn, hoặc `gemini-1.5-flash` cho nhanh hơn.

**Đổi persona:** sửa file `lib/personas.js`. Mỗi model có một `systemPrompt`
riêng - bạn có thể thay đổi tính cách, độ hài hước, vai trò chủ tọa.

**Đổi số vòng / thứ tự:** sửa file `lib/council.js` (hàm `runCouncil`).

---

## Endpoint API

### `POST /api/council`

```json
{ "question": "Nên học ngôn ngữ lập trình nào năm 2026?" }
```

Trả về `text/event-stream` với các sự kiện:

| Event | Payload | Khi nào |
|---|---|---|
| `phase` | `{ name, label }` | Bắt đầu một giai đoạn (opening / round1 / round2 / verdict) |
| `speaker_start` | `{ id, name, avatar, color, role, stage }` | Một model bắt đầu nói |
| `chunk` | `{ id, text }` | Một mẩu token mới |
| `speaker_end` | `{ id }` | Model nói xong |
| `error` | `{ message }` | Lỗi xảy ra |
| `done` | `{}` | Phiên kết thúc |

### `GET /api/health`

Trả về `{ ok, keysConfigured: { claude, chatgpt, gemini, grok } }` để kiểm tra key nào đã được cấu hình.

---

## Cảm hứng

Lấy cảm hứng từ các nghiên cứu & sản phẩm về "Model Council" / Multi-LLM
debate (Perplexity Model Council, Andrej Karpathy LLM Council, Council AI, …).
Ý tưởng cốt lõi: nhiều model debate sẽ ra câu trả lời tốt hơn 1 model đơn lẻ.
