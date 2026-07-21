// Basic in-memory rate limiter. Each AI surface gets its own independent
// per-user daily budget (own Map, own key namespace) via createAiRateLimit() —
// sharing a single counter across every AI feature would mean heavy Chat AI
// usage could silently exhaust a user's Marketing/OCR/Growth Advisor budget
// for the day, which isn't the intent of a per-feature limit.
function createAiRateLimit({ limit, label }) {
  const rateLimitMap = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const userId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);
    const key = `${userId}_${today}`;

    let userStats = rateLimitMap.get(key) || { count: 0 };

    if (userStats.count >= limit) {
      return res.status(429).json({ error: `Daily ${label} limit reached (${limit}/${limit}). Please try again tomorrow.` });
    }

    userStats.count++;
    rateLimitMap.set(key, userStats);

    res.setHeader('X-AI-Calls-Remaining', limit - userStats.count);
    next();
  };
}

// Chat AI — POST /api/ai/chat. Unchanged limit/name from before this refactor.
const aiRateLimit = createAiRateLimit({ limit: 100, label: 'AI chat' });

// Marketing AI campaign generation — a heavier, more occasional action
// (drafting a full campaign) than a chat turn, so a lower daily cap.
const marketingAiRateLimit = createAiRateLimit({ limit: 20, label: 'AI campaign generation' });

// OCR receipt/invoice scanning — can legitimately happen many times during a
// busy stocktaking/billing session, so a higher daily cap than campaign generation.
const ocrRateLimit = createAiRateLimit({ limit: 50, label: 'AI receipt scanning' });

// Growth Advisor chat — same conversational cadence as Chat AI, but its own
// budget so it doesn't compete with the main Business Advisor's quota.
const growthAdvisorRateLimit = createAiRateLimit({ limit: 100, label: 'AI Growth Advisor' });

module.exports = { aiRateLimit, marketingAiRateLimit, ocrRateLimit, growthAdvisorRateLimit, createAiRateLimit };
