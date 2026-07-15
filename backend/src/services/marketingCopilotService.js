const { getDb } = require('../config/db');
const { getMarketingOpportunities } = require('./marketingEngine');

/**
 * marketingCopilotService
 * Orchestrates insights across customers, products, and general opportunities
 * to build the Copilot Dashboard feed.
 */

async function getDashboardFeed(companyId) {
  // We'll aggregate the 'Intelligent Dashboard' response here
  
  // 1. Get Top Revenue Opportunity
  const ops = getMarketingOpportunities(companyId) || [];
  const topOp = ops.length > 0 ? ops[0] : null;

  let headlineOpportunity = null;
  if (topOp) {
    headlineOpportunity = {
      title: `Increase revenue by ₹${Math.round(topOp.expectedImpact).toLocaleString()}`,
      reasons: topOp.evidence.metrics,
      recommendedCampaign: topOp.name,
      expectedRoi: '3.8x', // Mocked or calculated via prediction service later
      confidence: topOp.confidenceScore
    };
  } else {
    headlineOpportunity = {
      title: "Keep your momentum going!",
      reasons: ["Sales are stable this week.", "No urgent churn detected."],
      recommendedCampaign: "Weekend Engagement",
      expectedRoi: '2.5x',
      confidence: 85
    };
  }

  return {
    headlineOpportunity,
    recentRecommendations: await getPendingRecommendations(companyId)
  };
}

async function getPendingRecommendations(companyId) {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT id, type, title, reasoning, expected_impact, confidence_score, created_at 
      FROM marketing_ai_recommendations 
      WHERE company_id = ? AND status = 'pending'
      ORDER BY confidence_score DESC LIMIT 5
    `).all(companyId);
  } finally {
    db.close();
  }
}

async function generateCampaignFromIntent(companyId, intent) {
  // Interacts with AI (contentGenerationService) to draft a campaign
  const contentGenerationService = require('./contentGenerationService');
  
  // Generate the draft
  const draft = await contentGenerationService.draftCampaign(intent, companyId);
  
  // Save to generated_campaigns
  const db = getDb();
  try {
    const info = db.prepare(`
      INSERT INTO generated_campaigns (company_id, name, description, target_audience, offer_details, budget, status)
      VALUES (?, ?, ?, ?, ?, ?, 'draft')
    `).run(companyId, draft.campaignName, draft.description, draft.audience, draft.offer, draft.budget);

    return { success: true, campaignId: info.lastInsertRowid, draft };
  } catch (err) {
    console.error('[Copilot] Error saving generated campaign:', err);
    throw err;
  } finally {
    db.close();
  }
}

module.exports = {
  getDashboardFeed,
  getPendingRecommendations,
  generateCampaignFromIntent
};
