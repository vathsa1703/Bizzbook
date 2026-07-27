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

  // Save to generated_campaigns. draft.copy (the whatsapp/sms/email text) and
  // draft.expectedRevenue/confidence are kept only on the returned `draft`
  // object for now -- generated_campaigns has no columns for them, and
  // approveGeneratedCampaign() below re-derives what it needs from `budget`
  // rather than adding a schema migration for a same-night demo fix.
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

// Promotes a drafted copilot campaign into the real marketing_campaigns
// table -- the one the Campaigns tab, /campaigns/:id/performance, and
// calculateCampaignROI() all actually read from. Without this, "Review &
// Approve" had nowhere real to write to: generated_campaigns is a write-only
// staging table with no route ever reading it back.
async function approveGeneratedCampaign(companyId, generatedId) {
  const db = getDb();
  try {
    const draftRow = db.prepare('SELECT * FROM generated_campaigns WHERE id = ? AND company_id = ?').get(generatedId, companyId);
    if (!draftRow) throw new Error('Generated campaign not found');
    if (draftRow.status === 'approved') throw new Error('This campaign has already been approved');

    db.exec('BEGIN TRANSACTION');
    try {
      // No historical AOV/reach data is attached to a copilot-drafted campaign
      // (it wasn't generated from a target segment/cohort like the Opportunity
      // Engine flow in marketing.js), so expected_impact is a simple 3x-budget
      // planning estimate here, not a modeled projection -- real actual_revenue/
      // roi get computed post-launch by calculateCampaignROI() same as any
      // other campaign, once real sales come in against it.
      const expectedImpact = Math.round((draftRow.budget || 0) * 3);

      const info = db.prepare(`
        INSERT INTO marketing_campaigns
          (name, type, segment, objective, target_count, expected_impact, status, campaign_snapshot, ai_content, company_id, campaign_cost, launched_at)
        VALUES (?, 'ai_copilot', ?, ?, 0, ?, 'active', ?, ?, ?, ?, datetime('now'))
      `).run(
        draftRow.name,
        draftRow.target_audience,
        draftRow.description,
        expectedImpact,
        JSON.stringify({ source: 'ai_copilot', generatedCampaignId: draftRow.id, generatedAt: draftRow.created_at }),
        JSON.stringify({ offer: draftRow.offer_details, audience: draftRow.target_audience }),
        companyId,
        draftRow.budget
      );
      const campaignId = info.lastInsertRowid;

      db.prepare(`UPDATE generated_campaigns SET status = 'approved' WHERE id = ?`).run(draftRow.id);

      db.exec('COMMIT');
      return db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').get(campaignId);
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  } finally {
    db.close();
  }
}

module.exports = {
  getDashboardFeed,
  getPendingRecommendations,
  generateCampaignFromIntent,
  approveGeneratedCampaign
};
