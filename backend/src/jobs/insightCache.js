const { dbGet, dbAll } = require('../config/dbEngine');
const { getDashboardInsights } = require('../services/insightEngine');

async function runInsightCacheJob() {
  try {
    console.log('[InsightCache] Running hourly cache job...');

    const companies = await dbAll('SELECT id FROM companies');

    const now = 'now()';
    const expiresAt = `(now() + interval '1 hour')`;

    let cachedCount = 0;
    for (const company of companies) {
      // Get all users in this company to cache it against them
      // Alternatively, we could just cache by company_id, but the cache is currently keyed by user_id
      const usersInCompany = await dbAll('SELECT id FROM users WHERE company_id = ?', [company.id]);
      if (usersInCompany.length === 0) continue;

      const dashboardInsights = await getDashboardInsights(company.id);
      const payloadStr = JSON.stringify(dashboardInsights);

      for (const user of usersInCompany) {
        const cacheKey = `dashboard_insights_userId_${user.id}`;
        await dbGet(`
          INSERT INTO ai_insights_cache (cache_key, payload, confidence, generated_at, expires_at, user_id)
          VALUES (?, ?, ?, ${now}, ${expiresAt}, ?)
          ON CONFLICT(cache_key) DO UPDATE SET
            payload=excluded.payload,
            confidence=excluded.confidence,
            generated_at=excluded.generated_at,
            expires_at=excluded.expires_at
        `, [cacheKey, payloadStr, dashboardInsights.confidence, user.id]);
        cachedCount++;
      }
    }

    console.log(`[InsightCache] Successfully cached insights for ${cachedCount} users across ${companies.length} companies.`);
  } catch (err) {
    console.error('[InsightCache] Error generating insights:', err);
  }
}

function startJob() {
  // Run immediately on startup, then every 60 minutes
  runInsightCacheJob();
  setInterval(runInsightCacheJob, 60 * 60 * 1000);
}

module.exports = { runInsightCacheJob, startJob };
