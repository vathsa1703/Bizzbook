import React, { useEffect, useRef, useState } from 'react';
import { HeroScene, AccentScene, CtaScene, shouldRenderScene } from '../components/landing/UnicornScenes';
import { BirdsScene, TopologyScene } from '../components/landing/VantaScenes';

// Marketing landing page shown to unauthenticated visitors before
// BusinessSelection/Login/Register. Pure presentational component — all
// auth/navigation state lives in App.jsx. Visual/animation logic ported from
// a standalone HTML/CSS/JS artifact (canvas gradient mesh hero, animated
// dashboard mockup, scroll reveals, count-up stats, AI chat demo).
//
// Theming: the app's ThemeProvider (context/ThemeContext.jsx) toggles a
// `dark` class on <html> for Tailwind's class-based dark mode. This
// component's CSS is scoped under `.bizbook-landing` and keys its dark
// palette off that SAME `.dark` class (`.dark .bizbook-landing { ... }`)
// rather than introducing a separate `data-theme` mechanism, so it stays in
// sync with the rest of the app's theme toggle automatically. A
// prefers-color-scheme fallback is kept for the earliest paint.

const FEATURES = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M9 2h6l1 4H8l1-4zM4 6h16l-1.5 14a2 2 0 01-2 2h-9a2 2 0 01-2-2L4 6z" />
      </svg>
    ),
    title: 'GST Invoicing',
    desc: "Correct tax, every time. CGST/SGST in-state, IGST out — worked out automatically from the HSN code and the buyer's state. GSTR-1 exports the moment filing is due.",
    bars: [0.4, 0.55, 0.35, 0.7, 0.5, 0.9],
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
        <path d="M3.27 6.96L12 12l8.73-5.04M12 22.08V12" />
      </svg>
    ),
    title: 'Stock',
    desc: 'Stock drops the second you bill. Reorder alerts fire before a fast mover runs out — anything untouched for 60 days gets called out as dead weight.',
    bars: [0.8, 0.6, 0.7, 0.3, 0.2, 0.15],
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    title: 'Staff & Payroll',
    desc: 'Attendance, leave, salary, records — payroll goes out on the 1st. No spreadsheet gymnastics required.',
    bars: [0.5, 0.5, 0.6, 0.55, 0.65, 0.6],
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    title: 'AI Business Advisor',
    desc: 'Ask it anything, in plain words. Every answer comes from a real query on your own sales and stock — the AI writes the sentence, never the number.',
    bars: [0.3, 0.45, 0.4, 0.7, 0.85, 0.95],
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 3v18h18" />
        <path d="M18.7 8l-5.1 5.1-2.4-2.4L7 15" />
      </svg>
    ),
    title: 'Marketing Opportunities',
    desc: "Finds the money already sitting in your data — overdue balances, ghosted customers, stock that won't move. Every opportunity comes pre-costed.",
    bars: [0.6, 0.4, 0.75, 0.5, 0.8, 0.65],
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="6" width="20" height="13" rx="2" />
        <path d="M2 10h20" />
        <path d="M6 15h4" />
      </svg>
    ),
    title: 'Udhaar & Payments',
    desc: "Every customer's khata, one list. What's owed, how overdue, and a reminder button right there.",
    bars: [0.9, 0.85, 0.8, 0.75, 0.7, 0.7],
  },
];

const CONVOS = {
  revenue: {
    q: "How's my business doing this month?",
    a: "Revenue is up 89% this month — ₹10,425 against ₹5,510 last month. Wheat Atta 10kg is your top seller. You're also sitting on ₹9,000 in dead stock (Premium Dry Fruits Box, zero sales in 60 days) — worth clearing before it ties up more capital. Recommended: run a clearance offer this week.",
  },
  customers: {
    q: 'Who should I follow up with?',
    a: "Two customers are worth a nudge: Priya Singh hasn't ordered in 52 days despite 3 past purchases, and Amit Verma has a ₹700 balance overdue since June 27. Both are real revenue sitting untouched — a WhatsApp reminder could recover ₹2,140 combined this week.",
  },
  stock: {
    q: 'What should I restock?',
    a: "Detergent Powder 1kg is critical — 4 units left against a reorder level of 12, and it's still selling daily. Basmati Rice and Sugar are both moving slowly against high stock right now, so hold off restocking those until they clear.",
  },
};

const LANDING_CSS = `
.bizbook-landing {
  --bg: #f7f7f9;
  --surface: #ffffff;
  --surface-2: #f0f0f4;
  --border: #e2e2ea;
  --text: #16161c;
  --text-dim: #62626f;
  --accent-1: #5b4fef;
  --accent-2: #a855f7;
  --accent-warm: #c9820f;
  --success: #1a8a5f;
  --shadow: 0 1px 2px rgba(20,20,30,.04), 0 8px 24px rgba(20,20,30,.06);
  --radius-sm: 6px;
  --radius-md: 14px;
  --radius-lg: 22px;
  --mono: "Geist Mono", ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
  --sans: "Geist", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  color-scheme: light;
  display: block;
  background: var(--bg);
  color: var(--text);
  font-family: var(--body);
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  position: relative;
}

@media (prefers-color-scheme: dark) {
  .bizbook-landing {
    --bg: #09090d; --surface: #121218; --surface-2: #17171f; --border: #262631;
    --text: #f3f2f7; --text-dim: #8d8b9c; --accent-warm: #f0a93a; --success: #34d399;
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 20px 60px rgba(0,0,0,.45);
    color-scheme: dark;
  }
}
.dark .bizbook-landing {
  --bg: #09090d; --surface: #121218; --surface-2: #17171f; --border: #262631;
  --text: #f3f2f7; --text-dim: #8d8b9c; --accent-warm: #f0a93a; --success: #34d399;
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 20px 60px rgba(0,0,0,.45);
  color-scheme: dark;
}

.bizbook-landing * { box-sizing: border-box; }
.bizbook-landing { scroll-behavior: smooth; }
.bizbook-landing h1, .bizbook-landing h2, .bizbook-landing h3, .bizbook-landing p { margin: 0; text-wrap: balance; }
/* Geist carries the display voice; Inter stays on body copy so long
   paragraphs keep the reading rhythm the rest of the app already has. */
.bizbook-landing h1, .bizbook-landing h2, .bizbook-landing h3,
.bizbook-landing .btn, .bizbook-landing .metric-value, .bizbook-landing .stat .v {
  font-family: var(--sans);
  font-feature-settings: "ss01" 1, "cv01" 1;
}

/* ── WebGL background layers ──────────────────────────────────────────
   Always sits UNDER a static gradient painted by the section itself, so a
   device with no WebGL / a blocked CDN / reduced-motion loses the motion
   but never the composition. */
/* top/bottom overshoot + overflow:visible so the scene bleeds past its own
   section's edge into the next one, same reasoning as .vanta-layer below. */
.bizbook-landing .us-layer { position: absolute; top: -18vh; left: 0; right: 0; bottom: -18vh; z-index: 0; pointer-events: none; overflow: visible; }
.bizbook-landing .us-canvas { position: absolute; inset: 0; transition: opacity 1.1s ease; }
.bizbook-landing .us-canvas canvas { display: block; }
.bizbook-landing .us-hero { mask-image: linear-gradient(to bottom, #000 45%, transparent 98%); -webkit-mask-image: linear-gradient(to bottom, #000 45%, transparent 98%); }
.bizbook-landing .us-accent { mask-image: radial-gradient(95% 130% at 50% 50%, #000 12%, transparent 92%); -webkit-mask-image: radial-gradient(95% 130% at 50% 50%, #000 12%, transparent 92%); }
.bizbook-landing .us-cta { mask-image: radial-gradient(90% 130% at 50% 50%, #000 12%, transparent 92%); -webkit-mask-image: radial-gradient(90% 130% at 50% 50%, #000 12%, transparent 92%); }

/* Vanta.js layers (Features/Stats) -- same absolute/z-0/no-pointer-events
   contract as .us-layer above, distinct class since Vanta manages its own
   canvas inside this host div rather than a React-rendered <canvas>.
   Masks reach further to the top/bottom edges here than the first pass
   (35%/20% solid core down to a much longer fade) specifically so each
   section's scene visually overlaps into its neighbour's fade zone instead
   of cutting off exactly at the section boundary -- that hard cutoff was
   what made the page read as stacked blocks instead of one continuous
   piece. */
.bizbook-landing .vanta-layer { position: absolute; top: -18vh; left: 0; right: 0; bottom: -18vh; z-index: 0; pointer-events: none; overflow: visible; opacity: .5; }
.bizbook-landing .vanta-layer canvas { display: block; }
.bizbook-landing #features .vanta-layer { mask-image: radial-gradient(95% 115% at 50% 40%, #000 15%, transparent 92%); -webkit-mask-image: radial-gradient(95% 115% at 50% 40%, #000 15%, transparent 92%); }
.bizbook-landing #stats-section .vanta-layer { mask-image: radial-gradient(90% 160% at 50% 50%, #000 8%, transparent 92%); -webkit-mask-image: radial-gradient(90% 160% at 50% 50%, #000 8%, transparent 92%); opacity: .4; }

/* Positioning context for the three newly-backgrounded sections, matching
   .hero / .spotlight's existing position:relative + z-2 content pattern so
   the scene layer stays behind the cards/copy instead of on top of them.
   overflow is deliberately NOT hidden here (unlike the original .hero/
   .spotlight pattern) -- the whole point of the taller vanta-layer above is
   to bleed past this section's own box into its neighbours, so clipping it
   here would defeat that. isolation:isolate still scopes z-index without
   needing overflow:hidden. */
.bizbook-landing #features, .bizbook-landing #stats-section, .bizbook-landing #pricing {
  position: relative; isolation: isolate;
}
.bizbook-landing #features .wrap, .bizbook-landing #stats-section .wrap, .bizbook-landing #pricing .wrap {
  position: relative; z-index: 2;
}

/* One continuous ambient wash behind the entire scroll, fixed to the
   viewport rather than any one section. Previously every section's colour
   only ever came from its own boxed-in scene, so the space between/around
   scenes (trust bar, section padding, anywhere a WebGL layer hadn't loaded
   yet) was flat neutral -- that flat gap between colourful boxes is what
   read as "segments." This sits at the very back (z-index -1) under
   everything, all the time, so there's always a shared ambient tone tying
   every section together regardless of which scene is currently in view. */
.bizbook-landing .page-wash {
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(1100px 700px at 20% 0%, color-mix(in srgb, var(--accent-1) 10%, transparent), transparent 70%),
    radial-gradient(1000px 650px at 85% 100%, color-mix(in srgb, var(--accent-2) 9%, transparent), transparent 70%);
}
.dark .bizbook-landing .page-wash {
  background:
    radial-gradient(1100px 700px at 20% 0%, color-mix(in srgb, var(--accent-1) 16%, transparent), transparent 70%),
    radial-gradient(1000px 650px at 85% 100%, color-mix(in srgb, var(--accent-2) 14%, transparent), transparent 70%);
}

/* The never-blank floor. Painted whether or not WebGL ever comes up. */
.bizbook-landing .bg-fallback {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(680px 420px at 22% 18%, color-mix(in srgb, var(--accent-1) 20%, transparent), transparent 68%),
    radial-gradient(620px 400px at 80% 12%, color-mix(in srgb, var(--accent-2) 18%, transparent), transparent 66%),
    radial-gradient(700px 460px at 50% 78%, color-mix(in srgb, var(--accent-1) 12%, transparent), transparent 70%);
}
.dark .bizbook-landing .bg-fallback {
  background:
    radial-gradient(680px 420px at 22% 18%, color-mix(in srgb, var(--accent-1) 34%, transparent), transparent 68%),
    radial-gradient(620px 400px at 80% 12%, color-mix(in srgb, var(--accent-2) 30%, transparent), transparent 66%),
    radial-gradient(700px 460px at 50% 78%, color-mix(in srgb, var(--accent-1) 20%, transparent), transparent 70%);
}
.bizbook-landing a { color: inherit; }
.bizbook-landing button { font-family: inherit; cursor: pointer; }
.bizbook-landing ::selection { background: var(--accent-1); color: #fff; }

.bizbook-landing .wrap { max-width: 1240px; margin: 0 auto; padding: 0 28px; }
@media (max-width: 640px) { .bizbook-landing .wrap { padding: 0 20px; } }

.bizbook-landing .grad-text {
  background: linear-gradient(100deg, var(--accent-1), var(--accent-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* Nav */
.bizbook-landing nav {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid transparent;
  transition: border-color .3s ease;
}
.bizbook-landing nav.scrolled { border-bottom-color: var(--border); }
.bizbook-landing .nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; }
.bizbook-landing .wordmark { font-family: var(--mono); font-weight: 600; font-size: 15px; letter-spacing: .02em; display: flex; align-items: center; gap: 8px; }
.bizbook-landing .wordmark .dot { width: 7px; height: 7px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-1), var(--accent-2)); box-shadow: 0 0 12px var(--accent-2); }
.bizbook-landing .nav-links { display: flex; align-items: center; gap: 32px; position: relative; }
.bizbook-landing .nav-links a { font-size: 13.5px; color: var(--text-dim); text-decoration: none; position: relative; padding: 4px 0; transition: color .2s ease; }
.bizbook-landing .nav-links a::after {
  content: ""; position: absolute; left: 0; bottom: 0; width: 0; height: 1px;
  background: var(--text); transition: width .25s ease;
}
.bizbook-landing .nav-links a:hover { color: var(--text); }
.bizbook-landing .nav-links a:hover::after { width: 100%; }
.bizbook-landing .nav-links a.active { color: var(--text); }
.bizbook-landing .nav-links a.active::after { width: 100%; background: var(--accent-2); }
.bizbook-landing .nav-cta { display: flex; align-items: center; gap: 18px; }
@media (max-width: 760px) { .bizbook-landing .nav-links { display: none; } }

.bizbook-landing #scrollbar {
  position: fixed; top: 0; left: 0; height: 2.5px; width: 100%; z-index: 100;
  background: linear-gradient(90deg, var(--accent-1), var(--accent-2), var(--accent-warm));
  transform: scaleX(0); transform-origin: left; will-change: transform;
}

.bizbook-landing #cursorGlow {
  position: fixed; top: 0; left: 0; width: 480px; height: 480px; border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--accent-2) 16%, transparent), transparent 70%);
  pointer-events: none; z-index: 3; transform: translate(-50%, -50%); will-change: transform;
  opacity: 0; transition: opacity .5s ease;
}
.bizbook-landing #cursorGlow.on { opacity: 1; }
@media (max-width: 760px), (hover: none) { .bizbook-landing #cursorGlow { display: none; } }

.bizbook-landing .btn {
  font-size: 13.5px; font-weight: 600; padding: 9px 18px; border-radius: var(--radius-sm);
  border: 1px solid transparent; transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
  display: inline-flex; align-items: center; gap: 8px; text-decoration: none; white-space: nowrap;
  position: relative; overflow: hidden; will-change: transform;
}
.bizbook-landing .btn:active { transform: scale(.97); }
.bizbook-landing .btn .ripple {
  position: absolute; border-radius: 50%; background: rgba(255,255,255,.5); pointer-events: none;
  transform: scale(0); opacity: .55; animation: bbRippleAnim .65s ease-out forwards;
}
.bizbook-landing .btn-ghost .ripple { background: color-mix(in srgb, var(--text) 30%, transparent); }
@keyframes bbRippleAnim { to { transform: scale(1); opacity: 0; } }
.bizbook-landing .btn-ghost { color: var(--text); border-color: var(--border); background: transparent; }
.bizbook-landing .btn-ghost:hover { background: var(--surface-2); }
.bizbook-landing .btn-primary {
  color: #fff; background: linear-gradient(100deg, var(--accent-1), var(--accent-2));
  box-shadow: 0 1px 0 rgba(255,255,255,.15) inset, 0 8px 24px -8px var(--accent-1);
}
.bizbook-landing .btn-primary:hover { box-shadow: 0 1px 0 rgba(255,255,255,.15) inset, 0 10px 32px -6px var(--accent-2); transform: translateY(-1px); }
.bizbook-landing .btn-lg { padding: 13px 26px; font-size: 14.5px; border-radius: var(--radius-sm); }

/* Hero */
.bizbook-landing .hero { position: relative; padding: 108px 0 96px; text-align: center; isolation: isolate; }
.bizbook-landing #mesh { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 0; opacity: .28; }
.dark .bizbook-landing #mesh { opacity: .55; }
.bizbook-landing .hero::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 260px;
  background: linear-gradient(to bottom, transparent, var(--bg));
  pointer-events: none; z-index: 1;
}
.bizbook-landing .hero-inner { position: relative; z-index: 2; }

.bizbook-landing .eyebrow {
  display: inline-flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 11.5px;
  letter-spacing: .06em; text-transform: uppercase; color: var(--text-dim);
  border: 1px solid var(--border); background: var(--surface); padding: 7px 14px; border-radius: 999px;
  opacity: 0; transform: translateY(14px);
}
.bizbook-landing .eyebrow .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-warm); box-shadow: 0 0 8px var(--accent-warm); animation: bbPulse 2s ease-in-out infinite; }

/* Type scale is deliberately uneven down the page: the hero shouts (76px,
   very tight), features speak (40px), the AI section leans in (52px, tightest
   leading), the closer settles (44px). */
.bizbook-landing h1.headline { font-size: clamp(37px, 6.6vw, 76px); font-weight: 700; letter-spacing: -.038em; line-height: 1.01; margin: 28px auto 0; max-width: 15ch; opacity: 0; transform: translateY(18px); }
.bizbook-landing .sub { font-size: clamp(15.5px, 1.9vw, 18.5px); color: var(--text-dim); max-width: 58ch; margin: 24px auto 0; line-height: 1.6; opacity: 0; transform: translateY(16px); }
.bizbook-landing .hero-ctas { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 34px; opacity: 0; transform: translateY(16px); }

.bizbook-landing .fade-in-up { animation: bbFadeInUp .8s cubic-bezier(.2,.7,.3,1) forwards; }

@keyframes bbFadeInUp { to { opacity: 1; transform: translateY(0); } }
@keyframes bbPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(1.4); } }

/* Dashboard mockup */
.bizbook-landing .stage { perspective: 1400px; margin-top: 64px; }
.bizbook-landing .app-window {
  max-width: 880px; margin: 0 auto; text-align: left;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md);
  box-shadow: var(--shadow); overflow: hidden;
  opacity: 0; transform: translateY(28px) rotateX(4deg);
  transition: transform .12s ease-out;
  transform-style: preserve-3d;
}
.bizbook-landing .app-titlebar { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--border); background: var(--surface-2); }
.bizbook-landing .app-titlebar .dots { display: flex; gap: 6px; }
.bizbook-landing .app-titlebar .dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
.bizbook-landing .app-titlebar .name { font-family: var(--mono); font-size: 12px; color: var(--text-dim); }
.bizbook-landing .live-chip { display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 11px; color: var(--accent-warm); }
.bizbook-landing .live-chip .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-warm); box-shadow: 0 0 8px var(--accent-warm); animation: bbPulse 1.8s ease-in-out infinite; }

.bizbook-landing .app-body { padding: 26px 26px 22px; display: grid; grid-template-columns: 1.6fr 1fr; gap: 22px; }
@media (max-width: 700px) { .bizbook-landing .app-body { grid-template-columns: 1fr; } }

.bizbook-landing .metric-row { display: flex; align-items: baseline; gap: 12px; margin-bottom: 4px; }
.bizbook-landing .metric-label { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--text-dim); }
.bizbook-landing .metric-value { font-family: var(--mono); font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums; }
.bizbook-landing .metric-delta { font-family: var(--mono); font-size: 12.5px; color: var(--success); background: color-mix(in srgb, var(--success) 14%, transparent); padding: 2px 8px; border-radius: 999px; }

.bizbook-landing .chart-wrap { margin-top: 14px; }
.bizbook-landing .chart-wrap svg { width: 100%; height: 108px; overflow: visible; }
.bizbook-landing .chart-path { fill: none; stroke: url(#lineGrad); stroke-width: 2.4; stroke-linecap: round; }
.bizbook-landing .chart-fill { opacity: .14; }

.bizbook-landing .side-col { display: flex; flex-direction: column; gap: 12px; }
.bizbook-landing .mini-stat { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; }
.bizbook-landing .mini-stat .l { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-dim); margin-bottom: 5px; }
.bizbook-landing .mini-stat .v { font-family: var(--mono); font-size: 16px; font-weight: 600; }

.bizbook-landing .opp-card {
  border: 1px solid color-mix(in srgb, var(--accent-2) 40%, var(--border));
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent-1) 10%, var(--surface)), var(--surface));
  border-radius: var(--radius-sm); padding: 13px 14px;
  opacity: 0; transform: translateX(18px);
}
.bizbook-landing .opp-card .t { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--accent-2); font-weight: 600; margin-bottom: 4px; }
.bizbook-landing .opp-card .d { font-size: 12.5px; line-height: 1.4; color: var(--text-dim); }
.bizbook-landing .opp-card .amt { font-family: var(--mono); font-weight: 700; color: var(--text); }

/* Trust bar */
/* Hard top/bottom rule lines removed here too, same reasoning as .spotlight. */
.bizbook-landing .trust { }
.bizbook-landing .trust-inner { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 40px; padding: 26px 0; }
.bizbook-landing .trust-item { display: flex; align-items: center; gap: 9px; font-size: 12.5px; color: var(--text-dim); font-family: var(--mono); letter-spacing: .01em; }
.bizbook-landing .trust-item svg { flex-shrink: 0; opacity: .8; }
.bizbook-landing .reveal { opacity: 0; transform: translateY(20px); transition: opacity .7s cubic-bezier(.2,.7,.3,1), transform .7s cubic-bezier(.2,.7,.3,1); }
.bizbook-landing .reveal.in { opacity: 1; transform: translateY(0); }

/* Section shell. Rhythm is intentionally not uniform — the AI section gets
   more air than the feature grid, the stats strip gets much less. */
.bizbook-landing section.block { padding: 104px 0; }
.bizbook-landing .spotlight .block { padding: 128px 0; }
.bizbook-landing section.block.tight { padding: 68px 0; }
.bizbook-landing section.block.closer { padding: 92px 0 112px; }
.bizbook-landing .head { max-width: 620px; margin-bottom: 56px; }
.bizbook-landing .kicker { font-family: var(--mono); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--accent-2); margin-bottom: 14px; }
.bizbook-landing .head h2 { font-size: clamp(27px, 3.8vw, 40px); font-weight: 700; letter-spacing: -.025em; line-height: 1.12; }
.bizbook-landing .head p { color: var(--text-dim); font-size: 15.5px; margin-top: 16px; line-height: 1.65; max-width: 48ch; }
/* AI section: biggest non-hero type, tightest leading, widest kicker tracking. */
.bizbook-landing .spotlight .head h2 { font-size: clamp(30px, 4.6vw, 52px); letter-spacing: -.032em; line-height: 1.03; }
.bizbook-landing .spotlight .kicker { letter-spacing: .16em; font-size: 11px; }
.bizbook-landing .spotlight .head p { font-size: 16.5px; max-width: 42ch; margin-top: 20px; }

/* Feature grid */
.bizbook-landing .grid6 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
@media (max-width: 900px) { .bizbook-landing .grid6 { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .bizbook-landing .grid6 { grid-template-columns: 1fr; } }

.bizbook-landing .fcard {
  border: 1px solid var(--border); border-radius: var(--radius-md); padding: 24px;
  background: var(--surface); position: relative; overflow: hidden;
  transition: transform .3s cubic-bezier(.2,.7,.3,1), border-color .3s ease, box-shadow .3s ease;
  transform-style: preserve-3d; will-change: transform;
  --mx: 50%; --my: 50%;
}
.bizbook-landing .fcard:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent-2) 45%, var(--border)); box-shadow: var(--shadow); }
.bizbook-landing .fcard.tilting { transition: border-color .3s ease, box-shadow .3s ease; }
.bizbook-landing .fcard::before {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
  background: linear-gradient(140deg, var(--accent-1), transparent 40%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  opacity: 0; transition: opacity .3s ease;
}
.bizbook-landing .fcard:hover::before { opacity: .6; }
.bizbook-landing .fcard .spot {
  position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 0;
  background: radial-gradient(240px circle at var(--mx) var(--my), color-mix(in srgb, var(--accent-2) 16%, transparent), transparent 72%);
  opacity: 0; transition: opacity .35s ease;
}
.bizbook-landing .fcard:hover .spot { opacity: 1; }
.bizbook-landing .fcard > * { position: relative; z-index: 1; }
.bizbook-landing .ficon {
  width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
  background: var(--surface-2); border: 1px solid var(--border); color: var(--accent-2); margin-bottom: 18px;
}
.bizbook-landing .fcard h3 { font-size: 16.5px; font-weight: 600; margin-bottom: 9px; letter-spacing: -.01em; }
.bizbook-landing .fcard p { font-size: 13.5px; color: var(--text-dim); line-height: 1.55; }
.bizbook-landing .fspark { display: flex; align-items: flex-end; gap: 3px; height: 26px; margin-top: 18px; }
.bizbook-landing .fspark i { flex: 1; background: linear-gradient(to top, var(--accent-1), var(--accent-2)); border-radius: 2px; opacity: .35; transform: scaleY(0); transform-origin: bottom; }
.bizbook-landing .fcard.in .fspark i { animation: bbBar .6s cubic-bezier(.2,.8,.3,1) forwards; }

@keyframes bbBar { to { transform: scaleY(var(--h)); opacity: .9; } }

/* AI spotlight */
/* No flat background-color and no border lines here anymore (previously
   var(--surface-2) + top/bottom borders) -- those drew a hard, literal seam
   at exactly this section's edges. The shared .page-wash plus this
   section's own bled-in Droplets scene now carry the tone shift instead, so
   scrolling into/out of this section is a gradient, not a cut. */
.bizbook-landing .spotlight { position: relative; isolation: isolate; }
.bizbook-landing .spotlight .wrap { position: relative; z-index: 2; }
.bizbook-landing .spot-grid { display: grid; grid-template-columns: .85fr 1.15fr; gap: 56px; align-items: center; }
@media (max-width: 860px) { .bizbook-landing .spot-grid { grid-template-columns: 1fr; gap: 40px; } }

.bizbook-landing .chatcard {
  border: 1px solid var(--border); border-radius: var(--radius-md);
  /* Slightly translucent so the Droplets scene reads behind the card, but
     opaque enough that the chat text never drops below AA contrast. */
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(18px) saturate(1.15);
  -webkit-backdrop-filter: blur(18px) saturate(1.15);
  box-shadow: var(--shadow); overflow: hidden;
}
.bizbook-landing .chatcard .app-titlebar { border-radius: 0; }
.bizbook-landing .chatbody { padding: 22px; min-height: 260px; }
.bizbook-landing .msg { max-width: 82%; padding: 11px 15px; border-radius: 13px; font-size: 13.5px; line-height: 1.5; margin-bottom: 14px; }
.bizbook-landing .msg.user { margin-left: auto; background: var(--surface-2); border: 1px solid var(--border); border-bottom-right-radius: 4px; }
.bizbook-landing .msg.ai { background: linear-gradient(160deg, color-mix(in srgb, var(--accent-1) 12%, var(--surface)), var(--surface)); border: 1px solid color-mix(in srgb, var(--accent-2) 30%, var(--border)); border-bottom-left-radius: 4px; }
.bizbook-landing .msg.ai .cursor { display: inline-block; width: 7px; height: 14px; background: var(--accent-2); margin-left: 2px; vertical-align: -2px; animation: bbBlink 1s step-end infinite; }
.bizbook-landing .typing { display: none; align-items: center; gap: 4px; padding: 11px 15px; }
.bizbook-landing .typing.on { display: inline-flex; }
.bizbook-landing .typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--text-dim); animation: bbBounce 1.2s ease-in-out infinite; }
.bizbook-landing .typing span:nth-child(2) { animation-delay: .15s; }
.bizbook-landing .typing span:nth-child(3) { animation-delay: .3s; }
@keyframes bbBounce { 0%,60%,100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-5px); opacity: 1; } }
@keyframes bbBlink { 50% { opacity: 0; } }

.bizbook-landing .grounding-note { display: flex; gap: 10px; align-items: flex-start; font-size: 12px; color: var(--text-dim); border-top: 1px solid var(--border); padding: 14px 22px; font-family: var(--mono); line-height: 1.5; }
.bizbook-landing .grounding-note svg { flex-shrink: 0; margin-top: 1px; color: var(--accent-warm); }

.bizbook-landing .chip-row { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 22px 20px; }
.bizbook-landing .chip {
  font-family: var(--sans); font-size: 12px; font-weight: 600; color: var(--text-dim);
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px;
  padding: 7px 13px; cursor: pointer; transition: color .2s ease, border-color .2s ease, background .2s ease, transform .15s ease;
}
.bizbook-landing .chip:hover { color: var(--text); border-color: color-mix(in srgb, var(--accent-2) 50%, var(--border)); transform: translateY(-1px); }
.bizbook-landing .chip:active { transform: scale(.96); }
.bizbook-landing .chip.active { color: #fff; background: linear-gradient(100deg, var(--accent-1), var(--accent-2)); border-color: transparent; }
.bizbook-landing .chip:disabled { opacity: .5; cursor: default; transform: none; }

/* Stats */
.bizbook-landing .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
@media (max-width: 760px) { .bizbook-landing .stats { grid-template-columns: repeat(2, 1fr); } }
.bizbook-landing .stat { background: var(--surface); padding: 34px 24px; transition: background .3s ease; }
.bizbook-landing .stat:hover { background: var(--surface-2); }
.bizbook-landing .stat .v { font-family: var(--mono); font-size: clamp(28px, 3.4vw, 38px); font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.01em; transition: transform .3s cubic-bezier(.2,.7,.3,1); }
.bizbook-landing .stat:hover .v { transform: scale(1.04); }
.bizbook-landing .stat .l { font-size: 12.5px; color: var(--text-dim); margin-top: 8px; }
.bizbook-landing .stat .detail {
  font-size: 11.5px; color: var(--accent-2); font-family: var(--mono); margin-top: 0;
  max-height: 0; opacity: 0; overflow: hidden; transition: max-height .35s ease, opacity .3s ease, margin-top .35s ease;
}
.bizbook-landing .stat:hover .detail { max-height: 30px; opacity: 1; margin-top: 8px; }

/* CTA */
.bizbook-landing .cta-card {
  border-radius: var(--radius-lg); padding: 64px 48px; text-align: center; position: relative; overflow: hidden;
  background: var(--surface); border: 1px solid var(--border);
}
.bizbook-landing .cta-card::before {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(600px 260px at 50% -10%, color-mix(in srgb, var(--accent-1) 30%, transparent), transparent 70%);
  pointer-events: none;
}
.bizbook-landing .cta-card h2 { font-size: clamp(26px, 3.6vw, 38px); font-weight: 700; letter-spacing: -.02em; position: relative; }
.bizbook-landing .cta-card p { color: var(--text-dim); margin-top: 14px; position: relative; }
.bizbook-landing .cta-card .hero-ctas { margin-top: 30px; position: relative; opacity: 1; transform: none; }
.bizbook-landing .cta-note { font-size: 12px; color: var(--text-dim); margin-top: 16px; font-family: var(--mono); position: relative; }

/* Footer */
.bizbook-landing footer { border-top: 1px solid var(--border); padding: 40px 0; }
.bizbook-landing .foot-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; }
.bizbook-landing .foot-links { display: flex; gap: 24px; flex-wrap: wrap; }
.bizbook-landing .foot-links a { font-size: 12.5px; color: var(--text-dim); text-decoration: none; }
.bizbook-landing .foot-links a:hover { color: var(--text); }
.bizbook-landing .foot-copy { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }

.bizbook-landing :focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; border-radius: 4px; }

@media (prefers-reduced-motion: reduce) {
  .bizbook-landing * { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; scroll-behavior: auto !important; }
}
`;

export default function LandingPage({ onGetStarted }) {
  // Decided once, on the client, before first paint of the hero: does this
  // device get WebGL scenes at all? (WebGL support, reduced-motion, saveData,
  // 2g, <=2GB RAM, <=2 cores — see components/landing/UnicornScenes.jsx.)
  // When false we fall back to the original 2D canvas gradient mesh, which
  // costs a fraction of a full-screen fragment shader.
  const [sceneOn] = useState(() => shouldRenderScene());
  const containerRef = useRef(null);
  const navRef = useRef(null);
  const scrollbarRef = useRef(null);
  const cursorGlowRef = useRef(null);
  const navLinksRef = useRef(null);
  const navPillRef = useRef(null);
  const meshCanvasRef = useRef(null);
  const heroRef = useRef(null);
  const stageRef = useRef(null);
  const appWindowRef = useRef(null);
  const chartPathRef = useRef(null);
  const oppCardRef = useRef(null);
  const revNumRef = useRef(null);
  const revDeltaRef = useRef(null);
  const eyebrowRef = useRef(null);
  const headlineRef = useRef(null);
  const subRef = useRef(null);
  const heroCtasRef = useRef(null);
  const chatSectionRef = useRef(null);
  const typingRef = useRef(null);
  const aiMsgRef = useRef(null);
  const aiMsgUserRef = useRef(null);
  const chipRefs = useRef({});

  const handleGetStarted = () => {
    if (onGetStarted) onGetStarted();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hoverCapable = window.matchMedia('(hover: hover)').matches;

    const timeouts = [];
    const rafs = [];
    let cancelled = false;
    const setTO = (fn, ms) => {
      const id = setTimeout(fn, ms);
      timeouts.push(id);
      return id;
    };
    const raf = (fn) => {
      const id = requestAnimationFrame(fn);
      rafs.push(id);
      return id;
    };

    // ── nav shadow + scroll progress bar ─────────────────────────────
    const nav = navRef.current;
    const scrollbar = scrollbarRef.current;
    function onScroll() {
      if (!nav || !scrollbar) return;
      nav.classList.toggle('scrolled', window.scrollY > 8);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      scrollbar.style.transform = `scaleX(${pct})`;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // ── scrollspy: moving nav pill tracks the section in view ────────
    const navLinksEl = navLinksRef.current;
    const navPill = navPillRef.current;
    const navAnchors = navLinksEl ? Array.prototype.slice.call(navLinksEl.querySelectorAll('a')) : [];
    const spySections = navAnchors.map((a) => container.querySelector(`#${a.getAttribute('data-section')}`));
    function movePill(anchor) {
      if (!navPill) return;
      if (!anchor) { navPill.style.opacity = 0; return; }
      const lr = navLinksEl.getBoundingClientRect();
      const ar = anchor.getBoundingClientRect();
      navPill.style.opacity = 1;
      navPill.style.left = `${ar.left - lr.left - 10}px`;
      navPill.style.width = `${ar.width + 20}px`;
      navAnchors.forEach((a) => a.classList.toggle('active', a === anchor));
    }
    const spyIo = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = spySections.indexOf(entry.target);
          if (idx > -1) movePill(navAnchors[idx]);
        }
      });
    }, { threshold: 0.35, rootMargin: '-64px 0px -40% 0px' });
    spySections.forEach((s) => { if (s) spyIo.observe(s); });
    function onResize() {
      const active = navAnchors.find((a) => a.classList.contains('active'));
      if (active) movePill(active);
    }
    window.addEventListener('resize', onResize);

    // ── cursor-follow ambient glow (lerped trail) ────────────────────
    const glow = cursorGlowRef.current;
    let onMouseMoveGlow;
    let onMouseLeaveGlow;
    if (glow && hoverCapable && !reduced) {
      let gx = window.innerWidth / 2;
      let gy = window.innerHeight / 2;
      let tx = gx;
      let ty = gy;
      onMouseMoveGlow = (e) => {
        tx = e.clientX; ty = e.clientY;
        glow.classList.add('on');
      };
      onMouseLeaveGlow = () => glow.classList.remove('on');
      window.addEventListener('mousemove', onMouseMoveGlow, { passive: true });
      document.addEventListener('mouseleave', onMouseLeaveGlow);
      (function glowLoop() {
        if (cancelled) return;
        gx += (tx - gx) * 0.12;
        gy += (ty - gy) * 0.12;
        glow.style.transform = `translate(${gx}px,${gy}px) translate(-50%,-50%)`;
        raf(glowLoop);
      })();
    }

    // ── hero load-in stagger ─────────────────────────────────────────
    function stagger(els, delay) {
      els.forEach((el, i) => {
        if (!el) return;
        setTO(() => el.classList.add('fade-in-up'), reduced ? 0 : i * delay);
      });
    }
    stagger([eyebrowRef.current, headlineRef.current, subRef.current, heroCtasRef.current], 110);

    // ── app window entrance + counters + chart draw ──────────────────
    const appWindow = appWindowRef.current;
    const chartPath = chartPathRef.current;
    const oppCard = oppCardRef.current;
    const revNum = revNumRef.current;
    const revDelta = revDeltaRef.current;

    function countUp(el, target, opts = {}) {
      const dur = opts.dur || 1400;
      let t0 = null;
      function fmt(v) {
        const n = Math.round(v);
        return `${opts.prefix || ''}${n.toLocaleString('en-IN')}${opts.suffix || ''}`;
      }
      if (reduced) { if (el) el.textContent = fmt(target); return; }
      function step(ts) {
        if (cancelled || !el) return;
        if (!t0) t0 = ts;
        const p = Math.min(1, (ts - t0) / dur);
        const eased = 1 - (1 - p) ** 3;
        el.textContent = fmt(target * eased);
        if (p < 1) raf(step);
      }
      raf(step);
    }

    function countUpDecimal(el, target, decimals, opts = {}) {
      if (reduced) { if (el) el.textContent = `${opts.prefix || ''}${target.toFixed(decimals)}${opts.suffix || ''}`; return; }
      let t0 = null;
      const dur = 1400;
      function step(ts) {
        if (cancelled || !el) return;
        if (!t0) t0 = ts;
        const p = Math.min(1, (ts - t0) / dur);
        const eased = 1 - (1 - p) ** 3;
        el.textContent = `${opts.prefix || ''}${(target * eased).toFixed(decimals)}${opts.suffix || ''}`;
        if (p < 1) raf(step);
      }
      raf(step);
    }

    let len = 0;
    if (chartPath) {
      len = chartPath.getTotalLength();
      chartPath.style.strokeDasharray = len;
      chartPath.style.strokeDashoffset = reduced ? 0 : len;
    }

    setTO(() => {
      if (cancelled) return;
      if (appWindow) {
        appWindow.style.transition = 'opacity .9s cubic-bezier(.2,.7,.3,1), transform .9s cubic-bezier(.2,.7,.3,1)';
        appWindow.style.opacity = 1;
        appWindow.style.transform = 'translateY(0) rotateX(0)';
      }
      countUp(revNum, 10425, { prefix: '₹', dur: 1500 });
      if (revDelta) revDelta.textContent = '+89%';
      if (chartPath) {
        chartPath.style.transition = reduced ? 'none' : 'stroke-dashoffset 1.6s cubic-bezier(.2,.8,.2,1)';
        chartPath.style.strokeDashoffset = 0;
      }
      setTO(() => {
        if (cancelled || !oppCard) return;
        oppCard.style.transition = 'opacity .6s ease, transform .6s cubic-bezier(.2,.7,.3,1)';
        oppCard.style.opacity = 1;
        oppCard.style.transform = 'translateX(0)';
      }, reduced ? 0 : 900);
    }, reduced ? 0 : 500);

    // ── subtle tilt on the hero app window ────────────────────────────
    const stage = stageRef.current;
    let onStageMove;
    let onStageLeave;
    if (stage && appWindow && !reduced && hoverCapable) {
      onStageMove = (e) => {
        const r = appWindow.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        appWindow.style.transform = `rotateX(${py * -4}deg) rotateY(${px * 6}deg)`;
      };
      onStageLeave = () => { appWindow.style.transform = 'rotateX(0) rotateY(0)'; };
      stage.addEventListener('mousemove', onStageMove);
      stage.addEventListener('mouseleave', onStageLeave);
    }

    // ── feature cards: cursor spotlight + 3D tilt ─────────────────────
    const fcards = Array.prototype.slice.call(container.querySelectorAll('.fcard'));
    const fcardHandlers = [];
    fcards.forEach((card) => {
      if (!hoverCapable || reduced) return;
      const onMove = (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        card.style.setProperty('--mx', `${px * 100}%`);
        card.style.setProperty('--my', `${py * 100}%`);
        const rx = (py - 0.5) * -8;
        const ry = (px - 0.5) * 10;
        card.classList.add('tilting');
        card.style.transform = `translateY(-4px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      };
      const onLeave = () => {
        card.classList.remove('tilting');
        card.style.transform = '';
      };
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);
      fcardHandlers.push({ card, onMove, onLeave });
    });

    // ── scroll reveal (IntersectionObserver) ──────────────────────────
    const revealEls = Array.prototype.slice.call(container.querySelectorAll('.reveal, .fcard'));
    const featureGrid = container.querySelector('#featureGrid');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const group = featureGrid && featureGrid.contains(el) ? featureGrid : null;
          let delay = 0;
          if (group) {
            delay = Array.prototype.indexOf.call(group.children, el) * 90;
          }
          setTO(() => {
            if (cancelled) return;
            el.classList.add('in');
            if (el.classList.contains('stats')) {
              el.querySelectorAll('[data-count]').forEach((node) => {
                const target = parseFloat(node.getAttribute('data-count'));
                const opts = {
                  prefix: node.getAttribute('data-prefix') || '',
                  suffix: node.getAttribute('data-suffix') || '',
                };
                if (node.getAttribute('data-compact') === 'cr') {
                  countUpDecimal(node, target / 10000000, 1, { prefix: opts.prefix, suffix: ` Cr${opts.suffix || ''}` });
                } else if (node.getAttribute('data-decimal')) {
                  const d = parseInt(node.getAttribute('data-decimal'), 10);
                  countUpDecimal(node, target / 10, d, opts);
                } else {
                  countUp(node, target, { dur: 1400, ...opts });
                }
              });
            }
          }, reduced ? 0 : delay);
          io.unobserve(el);
        }
      });
    }, { threshold: 0.2 });
    revealEls.forEach((el) => io.observe(el));

    // ── AI chat: click a question, get a real "streamed" demo answer ──
    const typing = typingRef.current;
    const aiMsg = aiMsgRef.current;
    const aiMsgUser = aiMsgUserRef.current;
    let convGen = 0;

    function setChipsDisabled(disabled) {
      Object.values(chipRefs.current).forEach((c) => { if (c) c.disabled = disabled; });
    }

    function playConvo(key) {
      const convo = CONVOS[key];
      if (!convo || !aiMsg || !aiMsgUser || !typing) return;
      convGen += 1;
      const myGen = convGen;
      Object.entries(chipRefs.current).forEach(([k, c]) => {
        if (c) c.classList.toggle('active', k === key);
      });
      aiMsgUser.textContent = convo.q;
      typing.classList.remove('on');
      aiMsg.style.display = 'none';
      aiMsg.textContent = '';
      setChipsDisabled(true);

      setTO(() => {
        if (cancelled || myGen !== convGen) return;
        typing.classList.add('on');
        setTO(() => {
          if (cancelled || myGen !== convGen) return;
          typing.classList.remove('on');
          aiMsg.style.display = 'block';
          if (reduced) { aiMsg.textContent = convo.a; setChipsDisabled(false); return; }
          let i = 0;
          const cursorEl = document.createElement('span');
          cursorEl.className = 'cursor';
          function typeChar() {
            if (cancelled || myGen !== convGen) return;
            if (i <= convo.a.length) {
              aiMsg.textContent = convo.a.slice(0, i);
              aiMsg.appendChild(cursorEl);
              i += 2;
              setTO(typeChar, 12);
            } else {
              cursorEl.remove();
              setChipsDisabled(false);
            }
          }
          typeChar();
        }, reduced ? 0 : 900);
      }, reduced ? 0 : 350);
    }
    // expose for chip onClick handlers below
    container._bbPlayConvo = playConvo;

    let played = false;
    const chatSection = chatSectionRef.current;
    let chatIo;
    if (chatSection) {
      chatIo = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !played) {
            played = true;
            setTO(() => playConvo('revenue'), reduced ? 0 : 500);
            chatIo.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      chatIo.observe(chatSection);
    }

    // ── canvas gradient mesh (hero background) ────────────────────────
    const canvas = meshCanvasRef.current;
    const hero = heroRef.current;
    let onHeroMove;
    let onHeroLeave;
    let onMeshResize;
    if (canvas && hero) {
      const ctx = canvas.getContext('2d');
      // Belt-and-braces: if the browser can't hand back a 2D context for any
      // reason, skip the animated mesh entirely rather than let a null
      // dereference bubble up and trip the app-wide error boundary — the
      // static `.bg-fallback` gradient underneath is still there either way.
      if (!ctx) return undefined;
      const blobs = [
        { x: 0.25, y: 0.3, r: 0.5, c: '99,79,239', p: 0 },
        { x: 0.75, y: 0.25, r: 0.45, c: '168,85,247', p: 2 },
        { x: 0.5, y: 0.7, r: 0.55, c: '91,79,239', p: 4 },
      ];

      function resize() {
        const rect = hero.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
      }
      resize();
      onMeshResize = resize;
      window.addEventListener('resize', onMeshResize);

      let mouseInHero = false;
      let mx = 0.5;
      let my = 0.4;
      if (hoverCapable) {
        onHeroMove = (e) => {
          const r = hero.getBoundingClientRect();
          mx = (e.clientX - r.left) / r.width;
          my = (e.clientY - r.top) / r.height;
          mouseInHero = true;
        };
        onHeroLeave = () => { mouseInHero = false; };
        hero.addEventListener('mousemove', onHeroMove);
        hero.addEventListener('mouseleave', onHeroLeave);
      }

      let t = 0;
      function draw() {
        if (cancelled) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        blobs.forEach((b, i) => {
          let driftX = b.x + Math.sin(t * 0.6 + b.p) * 0.05;
          let driftY = b.y + Math.cos(t * 0.5 + b.p) * 0.06;
          if (mouseInHero) {
            const pull = 0.06 + i * 0.015;
            driftX += (mx - driftX) * pull;
            driftY += (my - driftY) * pull;
          }
          const x = driftX * w;
          const y = driftY * h;
          const r = b.r * Math.max(w, h) * 0.6;
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, `rgba(${b.c},0.35)`);
          grad.addColorStop(1, `rgba(${b.c},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        });
        t += 0.0035;
        if (!reduced) raf(draw);
      }
      draw();
    }

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
      rafs.forEach((id) => cancelAnimationFrame(id));
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (onMeshResize) window.removeEventListener('resize', onMeshResize);
      if (onMouseMoveGlow) window.removeEventListener('mousemove', onMouseMoveGlow);
      if (onMouseLeaveGlow) document.removeEventListener('mouseleave', onMouseLeaveGlow);
      spyIo.disconnect();
      io.disconnect();
      if (chatIo) chatIo.disconnect();
      if (stage && onStageMove) stage.removeEventListener('mousemove', onStageMove);
      if (stage && onStageLeave) stage.removeEventListener('mouseleave', onStageLeave);
      fcardHandlers.forEach(({ card, onMove, onLeave }) => {
        card.removeEventListener('mousemove', onMove);
        card.removeEventListener('mouseleave', onLeave);
      });
      if (hero && onHeroMove) hero.removeEventListener('mousemove', onHeroMove);
      if (hero && onHeroLeave) hero.removeEventListener('mouseleave', onHeroLeave);
      delete container._bbPlayConvo;
    };
  }, []);

  // ── ripple + magnetic pull for .btn / .btn-lg, attached as plain JSX handlers ──
  function handleRipple(e) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const btn = e.currentTarget;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.6;
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = `${size}px`;
    span.style.height = `${size}px`;
    span.style.left = `${e.clientX - r.left - size / 2}px`;
    span.style.top = `${e.clientY - r.top - size / 2}px`;
    btn.appendChild(span);
    setTimeout(() => span.remove(), 650);
  }
  function handleMagnetMove(e) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hoverCapable = window.matchMedia('(hover: hover)').matches;
    if (reduced || !hoverCapable) return;
    const btn = e.currentTarget;
    const r = btn.getBoundingClientRect();
    const mx = e.clientX - (r.left + r.width / 2);
    const my = e.clientY - (r.top + r.height / 2);
    btn.style.transform = `translate(${mx * 0.28}px,${my * 0.35}px)`;
  }
  function handleMagnetLeave(e) {
    e.currentTarget.style.transform = '';
  }
  function handleChipClick(key) {
    const container = containerRef.current;
    if (container && container._bbPlayConvo) container._bbPlayConvo(key);
  }

  return (
    <div className="bizbook-landing" ref={containerRef}>
      <style>{LANDING_CSS}</style>

      <div className="page-wash" aria-hidden="true" />
      <div id="scrollbar" ref={scrollbarRef} />
      <div id="cursorGlow" ref={cursorGlowRef} />

      <nav id="nav" ref={navRef}>
        <div className="wrap nav-inner">
          <div className="wordmark"><span className="dot" />bizbook</div>
          <div className="nav-links" ref={navLinksRef}>
            <span className="nav-pill" ref={navPillRef} />
            <a href="#features" data-section="features">Product</a>
            <a href="#ai" data-section="ai">AI Advisor</a>
            <a href="#pricing" data-section="pricing">Pricing</a>
          </div>
          <div className="nav-cta">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={(e) => { handleRipple(e); handleGetStarted(); }}
            >
              Log in
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={(e) => { handleRipple(e); handleGetStarted(); }}
            >
              Start free
            </button>
          </div>
        </div>
      </nav>

      <section className="hero" ref={heroRef}>
        {/* z-0 static gradient, then WebGL over it, then hero-inner at z-2.
            Losing the scene costs motion, never layout. */}
        <div className="bg-fallback" />
        {sceneOn ? <HeroScene /> : <canvas id="mesh" ref={meshCanvasRef} />}
        <div className="wrap hero-inner">
          <div className="eyebrow" ref={eyebrowRef}><span className="pulse" />Built for Indian MSMEs · Zero busywork</div>
          <h1 className="headline" ref={headlineRef}>
            Stop stitching<br /><span className="grad-text">six apps</span> together.
          </h1>
          <p className="sub" ref={subRef}>
            Sales, stock, GST, payroll, and an AI that actually reads your books — one system, zero duct tape.
          </p>
          <div className="hero-ctas" ref={heroCtasRef}>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={(e) => { handleRipple(e); handleGetStarted(); }}
              onMouseMove={handleMagnetMove}
              onMouseLeave={handleMagnetLeave}
            >
              Start free
            </button>
            <a
              href="#ai"
              className="btn btn-ghost btn-lg"
              onClick={handleRipple}
              onMouseMove={handleMagnetMove}
              onMouseLeave={handleMagnetLeave}
            >
              Watch it think →
            </a>
          </div>

          <div className="stage" ref={stageRef}>
            <div className="app-window" ref={appWindowRef}>
              <div className="app-titlebar">
                <div className="dots"><span /><span /><span /></div>
                <div className="name">sunrise general store — home</div>
                <div className="live-chip"><span className="dot" />Live</div>
              </div>
              <div className="app-body">
                <div>
                  <div className="metric-row">
                    <span className="metric-label">Revenue this month</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-value" ref={revNumRef}>₹0</span>
                    <span className="metric-delta" ref={revDeltaRef}>+0%</span>
                  </div>
                  <div className="chart-wrap">
                    <svg viewBox="0 0 400 108" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#5b4fef" />
                          <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                        <linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#a855f7" />
                          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path className="chart-fill" fill="url(#fillGrad)" d="M0,88 L57,80 L114,70 L171,74 L228,58 L285,40 L342,26 L400,8 L400,108 L0,108 Z" />
                      <path className="chart-path" ref={chartPathRef} d="M0,88 L57,80 L114,70 L171,74 L228,58 L285,40 L342,26 L400,8" />
                    </svg>
                  </div>
                </div>
                <div className="side-col">
                  <div className="mini-stat"><div className="l">Low stock</div><div className="v">Detergent Powder — 4 left</div></div>
                  <div className="opp-card" ref={oppCardRef}>
                    <div className="t">Opportunity detected</div>
                    <div className="d">Dead stock: <span className="amt">₹6,120</span> locked, zero sales in 60 days.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="trust">
        <div className="wrap trust-inner">
          <div className="trust-item reveal"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>GST-compliant</div>
          <div className="trust-item reveal"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /></svg>Multi-branch, one login</div>
          <div className="trust-item reveal"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>Locked down by role</div>
          <div className="trust-item reveal"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>Built in India, for India</div>
        </div>
      </div>

      <section className="block" id="features">
        <div className="bg-fallback" />
        {sceneOn && <BirdsScene />}
        <div className="wrap">
          <div className="head reveal">
            <div className="kicker">The whole back office, minus the back office</div>
            <h2>Six tools you're paying for.<br />One you actually need.</h2>
            <p>One sale updates stock. One payroll run updates cash flow. Nothing here waits on anything else.</p>
          </div>
          <div className="grid6" id="featureGrid">
            {FEATURES.map((f) => (
              <div className="fcard reveal" key={f.title}>
                <div className="ficon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
                <div className="fspark">
                  {f.bars.map((h, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <i key={i} style={{ '--h': h }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="spotlight" id="ai" ref={chatSectionRef}>
        <div className="bg-fallback" />
        {sceneOn && <AccentScene />}
        <div className="wrap block">
          <div className="spot-grid">
            <div className="head reveal" style={{ marginBottom: 0 }}>
              <div className="kicker">Not a chatbot. An advisor.</div>
              <h2>It doesn't guess.<br />It just reads the ledger.</h2>
              <p>Every insight is a real query against your sales, stock, and payments. The model only writes the sentence — never the number.</p>
            </div>

            <div className="chatcard reveal">
              <div className="app-titlebar">
                <div className="dots"><span /><span /><span /></div>
                <div className="name">ai advisor</div>
                <div />
              </div>
              <div className="chatbody">
                <div className="msg user" ref={aiMsgUserRef}>How's my business doing this month?</div>
                <div className="typing" ref={typingRef}><span /><span /><span /></div>
                <div className="msg ai" ref={aiMsgRef} style={{ display: 'none' }} />
              </div>
              <div className="chip-row">
                <button
                  type="button"
                  className="chip"
                  ref={(el) => { chipRefs.current.revenue = el; }}
                  onClick={() => handleChipClick('revenue')}
                >
                  How&apos;s my business doing?
                </button>
                <button
                  type="button"
                  className="chip"
                  ref={(el) => { chipRefs.current.customers = el; }}
                  onClick={() => handleChipClick('customers')}
                >
                  Who should I follow up with?
                </button>
                <button
                  type="button"
                  className="chip"
                  ref={(el) => { chipRefs.current.stock = el; }}
                  onClick={() => handleChipClick('stock')}
                >
                  What should I restock?
                </button>
              </div>
              <div className="grounding-note">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                Every number above came from your database, live. Not generated, not guessed. Try it yourself.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="block tight" id="stats-section">
        <div className="bg-fallback" />
        {sceneOn && <TopologyScene />}
        <div className="wrap">
          <div className="stats reveal">
            <div className="stat"><div className="v" data-count="24000000" data-prefix="₹" data-suffix="+" data-compact="cr">₹0</div><div className="l">GST invoices filed</div><div className="detail">Every one of them audit-ready</div></div>
            <div className="stat"><div className="v" data-count="1200" data-suffix="+">0</div><div className="l">Businesses running on BizBook</div><div className="detail">14 states. 30+ trade categories.</div></div>
            <div className="stat"><div className="v" data-count="38" data-suffix=" hrs">0</div><div className="l">Hours back, per business, per month</div><div className="detail">A full workday, every month</div></div>
            <div className="stat"><div className="v" data-count="999" data-suffix="%" data-decimal="1">0</div><div className="l">Uptime</div><div className="detail">12 months straight. No excuses.</div></div>
          </div>
        </div>
      </section>

      <section className="block closer" id="pricing">
        <div className="bg-fallback" />
        {sceneOn && <CtaScene />}
        <div className="wrap">
          <div className="cta-card reveal">
            <h2>Stop juggling apps.<br />Start running one system.</h2>
            <p>First invoice in under 10 minutes. No card, no catch.</p>
            <div className="hero-ctas">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={(e) => { handleRipple(e); handleGetStarted(); }}
                onMouseMove={handleMagnetMove}
                onMouseLeave={handleMagnetLeave}
              >
                Start free
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-lg"
                onClick={(e) => { handleRipple(e); handleGetStarted(); }}
                onMouseMove={handleMagnetMove}
                onMouseLeave={handleMagnetLeave}
              >
                Talk to sales
              </button>
            </div>
            <div className="cta-note">Free for your first 50 invoices/month · then plans from ₹999/mo</div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap foot-inner">
          <div className="wordmark"><span className="dot" />bizbook</div>
          <div className="foot-links">
            <a href="#features">Product</a>
            <a href="#ai">AI Advisor</a>
            <a href="#pricing">Pricing</a>
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
          </div>
          <div className="foot-copy">© 2026 BizBook. Made for Indian MSMEs.</div>
        </div>
      </footer>
    </div>
  );
}
