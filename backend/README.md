# AI Voice Business Assistant — Backend

## Status (update this section as you go — this is the handoff doc)

Built and tested:
- [x] SQLite schema (products, sales, inventory, customers, invoices)
- [x] Synthetic data generator with engineered patterns (seed.js)
- [x] Deterministic analytics functions (dataService.js) — these run real SQL, never the LLM
- [ ] ~~Function-calling agent layer (aiAgent.js)~~ — never built; the live Chat AI uses static context
      injection (deterministic backend code selects and formats data into the prompt), not tool-calling
- [x] REST endpoints for testing the data layer directly (routes/analytics.js)
- [x] Main chat endpoint (routes/chat.js)
- [x] Voice transcription endpoint (routes/voice.js)

Not built yet (next steps):
- [ ] Frontend (React chat UI + mic button) — separate repo/folder
- [ ] Recommendations endpoint refinement (currently a simple rule-based pass inside dataService.getRecommendations)
- [ ] Auth / multi-tenant support (not needed for single-business MVP demo)
- [ ] Deployment config (Render/Railway for backend, Vercel for frontend)

## If you're picking this up mid-way (Claude or human)

Everything in `src/` is meant to be read top to bottom: `server.js` → `app.js` → `routes/*` → `services/*`.
The single most important design rule in this codebase: **the LLM never does arithmetic on business data.**
Deterministic backend code decides what to fetch (via `dataService.js`/`metricsService.js`/`marketingEngine.js`)
and formats it into the prompt as static context; the LLM only turns those pre-assembled numbers into a
sentence — there is no live tool/function-calling agent loop. If you're adding a new capability, add a new
deterministic function first, then have the context-building code call it and include the result in the prompt.

## Setup

```bash
npm install
cp .env.example .env        # then fill in your API key
npm run seed                 # generates data/business.db with realistic mock data
npm run dev                  # starts the server on PORT (default 5000)
```

Test the data layer first, before touching the AI layer:
```bash
curl http://localhost:5000/api/analytics/sales-summary?month=5&year=2026
curl http://localhost:5000/api/analytics/low-stock
```

Then test the AI layer:
```bash
curl -X POST http://localhost:5000/api/chat -H "Content-Type: application/json" \
  -d '{"message":"How were my sales last month?"}'
```

## Using an open-source / self-hosted LLM instead of Groq

The agent client is built on the standard OpenAI SDK pointed at a configurable base URL — Groq, OpenRouter,
and Ollama all speak the same OpenAI-compatible API shape, so switching providers is just an `.env` change,
not a code change.

**Groq (hosted, fast, recommended default):**
```
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_API_KEY=your_groq_key
CHAT_MODEL=llama-3.3-70b-versatile
```

**Ollama (fully local, zero API cost, weaker function-calling reliability on small models):**
```
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_API_KEY=ollama
CHAT_MODEL=llama3.1
```
Requires `ollama pull llama3.1` first. Test function calling thoroughly if you go this route — smaller
local models occasionally malform tool-call arguments. Llama 3.1 8B and Qwen2.5 are the more reliable
ones for tool use among the small local models.

**OpenRouter (hosted, access to many open models with one key):**
```
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=your_openrouter_key
CHAT_MODEL=meta-llama/llama-3.3-70b-instruct
```

## Environment Configuration & Recovery

### Required Environment Variables
The following variables are expected in `backend/.env`:
* `PORT` - The port for the backend server (e.g. 5003).
* `OPENAI_API_KEY` - Your API key (Required for AI features).
* `OPENAI_BASE_URL` - Endpoint URL (e.g., `https://api.groq.com/openai/v1`).
* `CHAT_MODEL` - Text model name (e.g., `llama-3.3-70b-versatile`).
* `WHISPER_MODEL` - Audio transcription model.

### Accidental Deletion / Recovery
If you accidentally delete or overwrite `backend/.env`, do **not** recreate it manually. Instead, run:
```bash
node src/scripts/update-env.js
```
This will automatically restore `.env` from `.env.example` with placeholders.

### Safe Environment Updates
**Never directly overwrite the `.env` file using automated scripts.** To programmatically update your environment variables, always use the safe updater script which automatically creates timestamped backups (e.g., `.env.2026-06-23.backup`):
```bash
node src/scripts/update-env.js OPENAI_API_KEY=your_real_key OPENAI_BASE_URL=https://api.groq.com/openai/v1
```

## AI Troubleshooting

If the AI is returning identical, repetitive, or generic responses:
1. **Check `/api/health`:** If the `ai.fallback_mode` flag is true, your `OPENAI_API_KEY` is missing or invalid.
2. **Review Server Logs:** The server will print a large yellow warning on startup if it boots into Mock/Fallback mode.
3. **Restore Key:** Use the safe updater script above to inject your real Groq/OpenAI key.

## Voice notes

STT uses Groq's Whisper-compatible transcription endpoint (same provider, same key as chat — check Groq's
current docs for the exact model name since hosted model names get refreshed). TTS is intentionally NOT
implemented on the backend — use the browser's built-in `SpeechSynthesis` API on the frontend. Don't burn
time on a TTS service for the MVP.
