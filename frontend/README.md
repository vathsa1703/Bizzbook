# AI Voice Business Assistant — Frontend

## Status

Built:
- [x] Vite + React + Tailwind scaffold
- [x] Design tokens matching screenshots (colors, radius, shadows)
- [x] BottomNav — Home / Sales / Stock / Customers / More
- [x] Home page — stat grid, quick actions, AI insight card
- [x] Sales page — dashboard view (revenue chart, top products) + AI chat view
- [x] Stock page — low stock / overstocked / slow-moving tabs
- [x] Customers page — search, pastel avatars, cleared/due badges (matches screenshot 3)
- [x] More page — profile, AI recommendations, settings menu
- [x] ChatBubble + VoiceButton components
- [x] useVoiceRecorder hook → /api/voice/transcribe
- [x] API client (src/api/client.js) → all backend endpoints

Not built yet:
- [ ] Individual customer detail view
- [ ] New Sale flow
- [ ] Invoice creation
- [ ] TTS (use browser SpeechSynthesis on the AI reply messages if desired)

## Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev        # http://localhost:5173
```

Make sure the backend is running on port 5000 first. Vite proxies all `/api/*` requests to it.

## Architecture notes

- `src/api/client.js` is the only file that touches the network — every page imports from there.
- Pages call the API on mount with `Promise.all()` and fall back gracefully when endpoints fail.
- The Customers page includes realistic mock data so the UI looks correct even before the backend
  `/api/analytics/customers` endpoint is wired up.
- The Sales "Ask AI" tab routes messages through `/api/chat`, which runs the full function-calling
  agent on the backend — the frontend never interprets business data itself.
- Voice: hold the mic button → releases → WebM blob → `/api/voice/transcribe` → text → sent as chat message.

## Design tokens (Tailwind)

| Token | Value | Used for |
|---|---|---|
| brand-blue | #2563EB | Primary CTA, active nav, user bubbles |
| brand-green | #16A34A | Positive metrics, cleared status |
| brand-amber | #D97706 | Outstanding credit, warnings |
| brand-red | #DC2626 | Low stock, destructive actions |
| brand-purple | #7C3AED | Invoices, reports |
| surface | #F8F9FC | Page background |
| card | #FFFFFF | All cards |

## File map

```
frontend/
├── package.json
├── vite.config.js        # proxies /api → localhost:5000
├── tailwind.config.js    # brand color tokens
├── postcss.config.js
├── index.html
├── .env.example
└── src/
    ├── main.jsx
    ├── App.jsx            # tab state, renders active page
    ├── index.css          # global reset + scrollbar utility
    ├── api/
    │   └── client.js      # all fetch calls in one place
    ├── components/
    │   ├── BottomNav.jsx
    │   ├── StatCard.jsx
    │   ├── RevenueWeekCard.jsx
    │   ├── ListItem.jsx
    │   ├── SectionCard.jsx
    │   ├── ChatBubble.jsx
    │   └── VoiceButton.jsx
    ├── hooks/
    │   └── useVoiceRecorder.js
    └── pages/
        ├── Home.jsx
        ├── Sales.jsx
        ├── Stock.jsx
        ├── Customers.jsx
        └── More.jsx
```
