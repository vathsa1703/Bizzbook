const rateLimitMap = new Map();

// Basic in-memory rate limiter for Phase 1. Limits each user to 10 LLM calls per day.
function aiRateLimit(req, res, next) {
  const userId = req.user.id;
  const today = new Date().toISOString().slice(0, 10);
  const key = `${userId}_${today}`;
  
  let userStats = rateLimitMap.get(key) || { count: 0 };
  
  if (userStats.count >= 100) {
    return res.status(429).json({ error: 'Daily AI chat limit reached (100/100). Please try again tomorrow.' });
  }
  
  userStats.count++;
  rateLimitMap.set(key, userStats);
  
  // Attach remaining limit to response headers for frontend tracking
  res.setHeader('X-AI-Calls-Remaining', 100 - userStats.count);
  next();
}

module.exports = { aiRateLimit };
