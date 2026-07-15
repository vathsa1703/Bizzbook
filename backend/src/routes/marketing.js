const express = require('express');
const { getMarketingOpportunities, getOpportunityById } = require('../services/marketingEngine');
const { generateCampaign } = require('../services/marketingAI');
const { getAllSegmentSummaries, getSegmentCustomers } = require('../services/segmentationEngine');
const { calculateCampaignROI } = require('../services/roiEngine');
const { calculateStoreHealthScore, getChannelROIRanking, getSuggestedBudgetSplit, getSegmentSpendPriority, getBreakEvenCalculator, getWeeklyRecommendation, getPostSpendReportCards, getDoNotSpendFlags } = require('../services/spendIntelligenceEngine');
const { getDb } = require('../config/db');
const { withBranchScope } = require('../utils/BranchScopedQuery');

const router = express.Router();

// ─── 1. Opportunities ────────────────────────────────────────────────────────

// GET /api/marketing/opportunities
router.get('/opportunities', (req, res) => {
  try {
    const opportunities = getMarketingOpportunities(req.user.companyId);
    res.json({ opportunities });
  } catch (err) {
    console.error('[Marketing] opportunities error:', err);
    res.status(500).json({ error: err.message || 'Failed to load marketing opportunities.' });
  }
});

// POST /api/marketing/refresh-signals
router.post('/refresh-signals', async (req, res) => {
  try {
    const { executeMarketingCron } = require('../cron/marketingCron');
    const result = await executeMarketingCron(req.user.companyId);
    if (result.success) {
      res.json({ message: 'Signals and Knowledge Graph updated successfully.' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. Segments ─────────────────────────────────────────────────────────────

// GET /api/marketing/segments
router.get('/segments', (req, res) => {
  try {
    const segments = getAllSegmentSummaries(req.user.companyId);
    res.json({ segments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/segments/:segmentId/customers
router.get('/segments/:segmentId/customers', (req, res) => {
  try {
    const customers = getSegmentCustomers(req.params.segmentId, req.user.companyId);
    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. Campaigns ────────────────────────────────────────────────────────────

// GET /api/marketing/campaigns
router.get('/campaigns', (req, res) => {
  const db = getDb();
  try {
    let query = 'SELECT * FROM marketing_campaigns WHERE company_id = ?';
    let params = [req.user.companyId];
    
    const scoped = withBranchScope(query, params, req.scopeContext, 'branch_id');
    scoped.sql += ' ORDER BY created_at DESC';
    
    const rows = db.prepare(scoped.sql).all(...scoped.params);
    // Parse JSON snapshot and ai_content if needed for frontend
    const campaigns = rows.map(r => ({
      ...r,
      campaign_snapshot: r.campaign_snapshot ? JSON.parse(r.campaign_snapshot) : null,
      ai_content: r.ai_content ? JSON.parse(r.ai_content) : null
    }));
    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// GET /api/marketing/campaigns/:id
router.get('/campaigns/:id', (req, res) => {
  const db = getDb();
  try {
    const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    
    campaign.campaign_snapshot = campaign.campaign_snapshot ? JSON.parse(campaign.campaign_snapshot) : null;
    campaign.ai_content = campaign.ai_content ? JSON.parse(campaign.ai_content) : null;
    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// POST /api/marketing/campaigns/generate
router.post('/campaigns/generate', async (req, res) => {
  const { segmentId, opportunityId, objective, coupon_id, channel } = req.body;
  if (!objective) return res.status(400).json({ error: 'objective required' });
  if (!segmentId && !opportunityId) return res.status(400).json({ error: 'segmentId or opportunityId required' });

  const db = getDb();
  try {
    let aiContent, snapshot, customers = [];
    let campaignType = 'segment_campaign';
    let expectedImpact = 0;
    let targetSegment = segmentId || null;

    if (opportunityId) {
      const opp = getOpportunityById(opportunityId, req.user.companyId);
      if (!opp) return res.status(404).json({ error: 'Opportunity not found' });
      
      campaignType = 'opportunity_campaign';
      targetSegment = opp.name;
      expectedImpact = opp.expectedImpact;
      
      // Extract customers if they exist in the cohort
      customers = (opp.evidence.cohort || []).filter(c => c.id).map(c => ({ customer_id: c.id }));

      snapshot = {
        opportunity: opportunityId,
        target_count: customers.length,
        estimated_revenue: expectedImpact,
        generated_at: new Date().toISOString(),
        coupon_id: coupon_id || null,
        channel: channel || null
      };

      aiContent = await generateCampaign(opp, objective);
    } else {
      // Legacy segment flow
      customers = getSegmentCustomers(segmentId, req.user.companyId);
      if (customers.length === 0) return res.status(400).json({ error: 'Segment has no customers' });

      const segmentSummaries = getAllSegmentSummaries(req.user.companyId);
      const segmentSummary = segmentSummaries.find(s => s.id === segmentId) || { name: segmentId, description: '' };
      expectedImpact = customers.reduce((sum, c) => sum + (c.total_revenue || 0), 0);
      
      snapshot = {
        segment: segmentId,
        target_count: customers.length,
        estimated_revenue: expectedImpact,
        generated_at: new Date().toISOString(),
        coupon_id: coupon_id || null,
        channel: channel || null
      };

      // Mock an opportunity object for the AI if coming from segment
      const mockOpp = {
        name: segmentSummary.name,
        detectedBecause: `User selected segment: ${segmentSummary.name}`,
        confidenceScore: 70,
        impactTiers: { conservative: expectedImpact*0.1, expected: expectedImpact*0.2, optimistic: expectedImpact*0.3 },
        evidence: { metrics: [`Targeting ${customers.length} customers in segment`], cohort: customers.slice(0, 10).map(c => ({ id: c.customer_id, name: c.name })) }
      };
      aiContent = await generateCampaign(mockOpp, objective);
    }

    const companyId = req.user.companyId;
    // Save Campaign
    db.prepare('BEGIN').run();
    const result = db.prepare(`
      INSERT INTO marketing_campaigns 
      (name, type, segment, objective, target_count, expected_impact, status, campaign_snapshot, ai_content, opportunity_id, company_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      aiContent.campaignName || `Campaign for ${objective}`,
      campaignType,
      targetSegment,
      objective,
      customers.length,
      expectedImpact,
      'draft',
      JSON.stringify(snapshot),
      JSON.stringify(aiContent),
      opportunityId || null,
      companyId
    );
    const campaignId = result.lastInsertRowid;
    
    if (coupon_id) {
       db.prepare('UPDATE coupons SET campaign_id = ? WHERE id = ? AND company_id = ?').run(campaignId, coupon_id, companyId);
    }

    // Save Targets
    if (customers.length > 0) {
      const insertTarget = db.prepare('INSERT INTO marketing_campaign_targets (campaign_id, customer_id, company_id) VALUES (?, ?, ?)');
      customers.forEach(c => insertTarget.run(campaignId, c.customer_id, companyId));
    }

    db.prepare('COMMIT').run();

    const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').get(campaignId);
    campaign.campaign_snapshot = JSON.parse(campaign.campaign_snapshot);
    campaign.ai_content = JSON.parse(campaign.ai_content);

    res.status(201).json({ campaign });
  } catch (err) {
    if (db.inTransaction) db.prepare('ROLLBACK').run();
    console.error('[Marketing] generate error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// PUT /api/marketing/campaigns/:id
router.put('/campaigns/:id', (req, res) => {
  const { status, notes, campaign_cost } = req.body;
  const db = getDb();
  try {
    const existing = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Campaign not found' });

    let launchedAt = existing.launched_at;
    let completedAt = existing.completed_at;

    // Update timestamps based on status
    if (status === 'active' && !launchedAt) {
      launchedAt = new Date().toISOString();
    } else if (status === 'completed' && !completedAt) {
      completedAt = new Date().toISOString();
    }

    db.prepare(`
      UPDATE marketing_campaigns 
      SET status = COALESCE(?, status), 
          notes = COALESCE(?, notes),
          campaign_cost = COALESCE(?, campaign_cost),
          launched_at = ?,
          completed_at = ?
      WHERE id = ?
    `).run(
      status ?? null, 
      notes ?? null, 
      campaign_cost ?? null, 
      launchedAt ?? null, 
      completedAt ?? null, 
      req.params.id
    );

    const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').get(req.params.id);
    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// GET /api/marketing/campaigns/:id/performance
router.get('/campaigns/:id/performance', (req, res) => {
  try {
    const performance = calculateCampaignROI(req.params.id, req.user.companyId);
    res.json({ performance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/campaigns/:id/export/csv
router.get('/campaigns/:id/export/csv', (req, res) => {
  const db = getDb();
  try {
    const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const aiContent = campaign.ai_content ? JSON.parse(campaign.ai_content) : {};
    const msg = aiContent.whatsappMessage || aiContent.smsMessage || '';

    const targets = db.prepare(`
      SELECT c.name, c.phone, c.email
      FROM marketing_campaign_targets t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.campaign_id = ?
    `).all(campaign.id);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign_${campaign.id}_targets.csv"`);

    let csv = 'Customer Name,Phone,Email,Segment,Generated Messagen';
    targets.forEach(t => {
      // Escape quotes in message
      const escapedMsg = msg.replace(/"/g, '""');
      csv += `"${t.name || ''}","${t.phone || ''}","${t.email || ''}","${campaign.segment || ''}","${escapedMsg}"n`;
    });

    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// ─── 4. Dashboard ────────────────────────────────────────────────────────────

// GET /api/marketing/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDb();
  try {
    // Basic stats from campaigns
    const stats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN status = 'active' THEN 1 END) as activeCampaigns,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as campaignsCompleted,
        SUM(CASE WHEN status IN ('completed', 'active') THEN actual_revenue ELSE 0 END) as totalRecoveredRevenue,
        AVG(CASE WHEN roi IS NOT NULL THEN roi ELSE NULL END) as averageROI
      FROM marketing_campaigns
    `).get();

    // Top performing campaign
    const topCampaign = db.prepare(`
      SELECT id, name, actual_revenue as revenue, roi 
      FROM marketing_campaigns 
      WHERE roi IS NOT NULL 
      ORDER BY roi DESC LIMIT 1
    `).get();

    // Phase 1: Omnichannel & Coupon Stats
    const omnichannelStats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as totalSent,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as totalDelivered,
        COUNT(CASE WHEN status = 'read' THEN 1 END) as totalRead
      FROM communication_logs
      WHERE company_id = ?
    `).get(req.user.companyId);

    const couponStats = db.prepare(`
      SELECT
        COUNT(id) as redemptions,
        SUM(discount_applied) as totalDiscount
      FROM coupon_redemptions
      WHERE company_id = ?
    `).get(req.user.companyId);

    // Re-use engine data
    const opps = getMarketingOpportunities(req.user.companyId);
    const totalOpportunityValue = opps.reduce((s, o) => s + o.expectedImpact, 0);
    const deadStockOpp = opps.find(o => o.type === 'dead_stock_liquidation');
    const retentionOpp = opps.find(o => o.type === 'customer_retention');

    res.json({
      totalOpportunityValue,
      activeCampaigns: stats.activeCampaigns || 0,
      averageROI: stats.averageROI ? Math.round(stats.averageROI * 100) : 0, // convert 0.15 to 15
      totalRecoveredRevenue: stats.totalRecoveredRevenue || 0,
      campaignsCompleted: stats.campaignsCompleted || 0,
      customersAtRisk: retentionOpp ? retentionOpp.evidence.cohort.length : 0, // approximate
      deadStockValue: deadStockOpp ? deadStockOpp.expectedImpact : 0,
      topPerformingCampaign: topCampaign || null,
      omnichannelStats,
      couponStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// Add manual POST /api/marketing/campaigns backwards compatibility just in case
router.post('/campaigns', (req, res) => {
  const { opportunity_id, name, type, target_count, expected_impact, notes } = req.body;
  const db = getDb();
  try {
    const companyId = req.user.companyId;
    const result = db.prepare(
      'INSERT INTO marketing_campaigns (opportunity_id, name, type, target_count, expected_impact, notes, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(opportunity_id || null, name, type || 'manual', target_count || 0, expected_impact || 0, notes, 'draft', companyId);
    const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// DELETE /api/marketing/campaigns/:id
router.delete('/campaigns/:id', (req, res) => {
  const db = getDb();
  try {
    const existing = db.prepare('SELECT id FROM marketing_campaigns WHERE id = ? AND company_id = ?').get(req.params.id, req.user.companyId);
    if (!existing) return res.status(404).json({ error: 'Campaign not found' });

    db.prepare('BEGIN').run();
    db.prepare('DELETE FROM marketing_campaign_targets WHERE campaign_id = ?').run(req.params.id);
    db.prepare('DELETE FROM marketing_campaigns WHERE id = ?').run(req.params.id);
    db.prepare('COMMIT').run();
    res.status(204).end();
  } catch (err) {
    if (db.inTransaction) db.prepare('ROLLBACK').run();
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// =============================================================================
// PHASE 1: CORE MARKETING FOUNDATION
// =============================================================================

// ─── 5. Customer Wallet ──────────────────────────────────────────────────────

router.get('/wallet/:customerId', (req, res) => {
  const db = getDb();
  try {
    const balances = db.prepare('SELECT balance_type, balance FROM customer_wallets WHERE customer_id = ? AND company_id = ?').all(req.params.customerId, req.user.companyId);
    res.json({ balances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

router.post('/wallet/adjust', (req, res) => {
  const db = getDb();
  try {
    const { customer_id, balance_type, amount, transaction_type, reference_id, description } = req.body;
    db.prepare('BEGIN').run();
    
    // Ensure wallet exists
    let wallet = db.prepare('SELECT id, balance FROM customer_wallets WHERE customer_id = ? AND balance_type = ?').get(customer_id, balance_type || 'store_credit');
    if (!wallet) {
      const result = db.prepare('INSERT INTO customer_wallets (company_id, customer_id, balance_type, balance) VALUES (?, ?, ?, 0)').run(req.user.companyId, customer_id, balance_type || 'store_credit');
      wallet = { id: result.lastInsertRowid, balance: 0 };
    }
    
    const newBalance = wallet.balance + amount;
    db.prepare(`UPDATE customer_wallets SET balance = ?, updated_at = datetime('now') WHERE id = ?`).run(newBalance, wallet.id);
    
    db.prepare('INSERT INTO wallet_transactions (company_id, wallet_id, amount, transaction_type, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.companyId, wallet.id, amount, transaction_type, reference_id || null, description || null);
      
    // Knowledge Graph insertion (Phase 1 rule)
    const relType = amount >= 0 ? 'earned_reward' : 'burned_reward';
    db.prepare('INSERT INTO marketing_signals (company_id, engine_type, entity_type, entity_id, signal_name, signal_value, confidence_score, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.companyId, 'wallet', 'customer', customer_id, `Wallet Adjustment: ${transaction_type}`, amount, 100, JSON.stringify({ balance_type }));
    
    db.prepare('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.companyId, 'customer', customer_id, relType, 'wallet', wallet.id, Math.abs(amount));

    db.prepare('COMMIT').run();
    res.json({ success: true, newBalance });
  } catch (err) {
    if (db.inTransaction) db.prepare('ROLLBACK').run();
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// ─── 6. Custom Segments ──────────────────────────────────────────────────────

router.post('/segments', (req, res) => {
  const db = getDb();
  try {
    const { name, description, logic_type, rules } = req.body;
    db.prepare('BEGIN').run();
    const result = db.prepare('INSERT INTO custom_segments (company_id, name, description, segment_type, logic_type) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.companyId, name, description, 'rule_based', logic_type || 'AND');
      
    const segmentId = result.lastInsertRowid;
    const insertRule = db.prepare('INSERT INTO segment_rules (segment_id, rule_type, operator, value) VALUES (?, ?, ?, ?)');
    for (const r of rules || []) {
      insertRule.run(segmentId, r.rule_type, r.operator, r.value);
    }
    db.prepare('COMMIT').run();
    res.json({ success: true, segmentId });
  } catch (err) {
    if (db.inTransaction) db.prepare('ROLLBACK').run();
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// ─── 7. Coupons ──────────────────────────────────────────────────────────────

router.get('/coupons', (req, res) => {
  const db = getDb();
  try {
    const coupons = db.prepare('SELECT * FROM coupons WHERE company_id = ?').all(req.user.companyId);
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

router.post('/coupons', (req, res) => {
  const db = getDb();
  try {
    const { code, discount_type, discount_value, min_order_value, max_discount, target_segment_id, usage_limit, expires_at, campaign_id } = req.body;
    const result = db.prepare(`
      INSERT INTO coupons (company_id, campaign_id, code, discount_type, discount_value, min_order_value, max_discount, target_segment_id, usage_limit, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.companyId, campaign_id || null, code, discount_type, discount_value, min_order_value || 0, max_discount || null, target_segment_id || null, usage_limit || null, expires_at || null);
    res.json({ success: true, couponId: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

router.post('/coupons/validate', (req, res) => {
  const db = getDb();
  try {
    const { code, customer_id, cart_value } = req.body;
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND company_id = ?').get(code, req.user.companyId);
    
    if (!coupon) return res.status(404).json({ valid: false, error: 'Coupon not found.' });
    if (coupon.usage_limit && coupon.times_used >= coupon.usage_limit) return res.status(400).json({ valid: false, error: 'Coupon usage limit reached.' });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(400).json({ valid: false, error: 'Coupon expired.' });
    if (coupon.min_order_value && cart_value < coupon.min_order_value) return res.status(400).json({ valid: false, error: `Minimum order value is ₹${coupon.min_order_value}.` });
    
    res.json({ valid: true, coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// NOTE: coupon redemption endpoint (or logic) is handled when an invoice is created, but for pure API completion:
router.post('/coupons/redeem', (req, res) => {
  const db = getDb();
  try {
    const { coupon_id, customer_id, invoice_id, discount_applied } = req.body;
    db.prepare('BEGIN').run();
    db.prepare('INSERT INTO coupon_redemptions (company_id, coupon_id, customer_id, invoice_id, discount_applied) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.companyId, coupon_id, customer_id, invoice_id || null, discount_applied);
    db.prepare('UPDATE coupons SET times_used = times_used + 1 WHERE id = ?').run(coupon_id);
    
    // Knowledge Graph
    db.prepare('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.companyId, 'customer', customer_id, 'redeemed_coupon', 'coupon', coupon_id, discount_applied);
      
    db.prepare('COMMIT').run();
    res.json({ success: true });
  } catch (err) {
    if (db.inTransaction) db.prepare('ROLLBACK').run();
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// ─── 8. Referrals ────────────────────────────────────────────────────────────

router.get('/referrals/:customerId', (req, res) => {
  const db = getDb();
  try {
    let referral = db.prepare('SELECT * FROM referral_codes WHERE customer_id = ? AND company_id = ?').get(req.params.customerId, req.user.companyId);
    if (!referral) {
      const code = `REF${req.params.customerId}${Math.random().toString(36).substring(2,6).toUpperCase()}`;
      db.prepare('INSERT INTO referral_codes (company_id, customer_id, code, reward_referrer, reward_referee) VALUES (?, ?, ?, ?, ?)')
        .run(req.user.companyId, req.params.customerId, code, 50, 50); // Default 50 reward
      referral = db.prepare('SELECT * FROM referral_codes WHERE customer_id = ? AND company_id = ?').get(req.params.customerId, req.user.companyId);
    }
    res.json({ referral });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

router.post('/referrals/redeem', (req, res) => {
  const db = getDb();
  try {
    const { code, new_customer_id } = req.body;
    const referral = db.prepare('SELECT * FROM referral_codes WHERE code = ? AND company_id = ?').get(code, req.user.companyId);
    if (!referral) return res.status(404).json({ error: 'Invalid referral code.' });
    if (referral.customer_id === new_customer_id) return res.status(400).json({ error: 'Cannot refer yourself.' });
    
    db.prepare('BEGIN').run();
    db.prepare('INSERT INTO referral_uses (company_id, referral_id, new_customer_id) VALUES (?, ?, ?)')
      .run(req.user.companyId, referral.id, new_customer_id);
      
    // Credit Referrer
    let rWallet = db.prepare('SELECT id, balance FROM customer_wallets WHERE customer_id = ? AND balance_type = ?').get(referral.customer_id, 'reward_points');
    if (!rWallet) {
       const rId = db.prepare('INSERT INTO customer_wallets (company_id, customer_id, balance_type, balance) VALUES (?, ?, ?, 0)').run(req.user.companyId, referral.customer_id, 'reward_points');
       rWallet = { id: rId.lastInsertRowid, balance: 0 };
    }
    db.prepare('UPDATE customer_wallets SET balance = balance + ? WHERE id = ?').run(referral.reward_referrer, rWallet.id);
    db.prepare('INSERT INTO wallet_transactions (company_id, wallet_id, amount, transaction_type, description) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.companyId, rWallet.id, referral.reward_referrer, 'earn', 'Referral reward');
      
    // Knowledge Graph
    db.prepare('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.companyId, 'customer', referral.customer_id, 'referred', 'customer', new_customer_id, referral.reward_referrer);

    db.prepare('COMMIT').run();
    res.json({ success: true, reward_referee: referral.reward_referee });
  } catch (err) {
    if (db.inTransaction) db.prepare('ROLLBACK').run();
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// ─── 9. Feedback Surveys ─────────────────────────────────────────────────────

router.post('/surveys/send', (req, res) => {
  const db = getDb();
  try {
    const { campaign_id, invoice_id, type, question_text } = req.body;
    const result = db.prepare('INSERT INTO feedback_surveys (company_id, campaign_id, invoice_id, type, question_text) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.companyId, campaign_id || null, invoice_id || null, type, question_text);
    res.json({ success: true, surveyId: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

router.post('/surveys/submit', (req, res) => {
  const db = getDb();
  try {
    const { survey_id, customer_id, rating, feedback_text } = req.body;
    db.prepare('BEGIN').run();
    db.prepare('INSERT INTO survey_responses (company_id, survey_id, customer_id, rating, feedback_text) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.companyId, survey_id, customer_id, rating, feedback_text);
      
    // Knowledge Graph
    db.prepare('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.companyId, 'customer', customer_id, 'left_rating', 'survey', survey_id, rating);
      
    db.prepare('INSERT INTO marketing_signals (company_id, engine_type, entity_type, entity_id, signal_name, signal_value, confidence_score) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.companyId, 'feedback', 'customer', customer_id, `Customer Satisfaction Rating`, rating, 100);

    db.prepare('COMMIT').run();
    res.json({ success: true });
  } catch (err) {
    if (db.inTransaction) db.prepare('ROLLBACK').run();
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// ─── 10. Omnichannel Delivery ────────────────────────────────────────────────

router.post('/communications/send', (req, res) => {
  const db = getDb();
  try {
    const { customer_id, campaign_id, channel, message_payload } = req.body;
    
    // MOCK ADAPTER INTERFACE
    // In Phase 1, we just mock the send and insert into DB.
    console.log(`[Omnichannel Mock] Sending ${channel} to customer ${customer_id}: ${message_payload}`);
    
    db.prepare('BEGIN').run();
    
    const result = db.prepare('INSERT INTO communication_logs (company_id, customer_id, campaign_id, channel, status, message_payload) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.companyId, customer_id, campaign_id || null, channel, 'sent', message_payload);
      
    if (campaign_id) {
      db.prepare('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(req.user.companyId, 'campaign', campaign_id, 'sent_message_to', 'customer', customer_id, 1.0);
    }
    
    db.prepare('COMMIT').run();
    res.json({ success: true, logId: result.lastInsertRowid });
  } catch (err) {
    if (db.inTransaction) db.prepare('ROLLBACK').run();
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

router.post('/communications/webhook', (req, res) => {
  const db = getDb();
  try {
    const { log_id, status } = req.body;
    db.prepare('UPDATE communication_logs SET status = ? WHERE id = ? AND company_id = ?').run(status, log_id, req.user.companyId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    db.close();
  }
});

// ─── 11. Spend Intelligence ──────────────────────────────────────────────────

router.get('/health-score', (req, res) => {
  try {
    const health = calculateStoreHealthScore(req.user.companyId);
    res.json(health);
  } catch (err) {
    console.error('[Marketing] health-score error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/channel-roi', (req, res) => {
  try {
    const data = getChannelROIRanking(req.user.companyId);
    res.json(data);
  } catch (err) {
    console.error('[Marketing] channel-roi error:', err);
    res.status(500).json({ error: err.message });
  }
});
router.post('/budget-split', (req, res) => {
  try {
    const { budget } = req.body;
    const data = getSuggestedBudgetSplit(req.user.companyId, budget ? Number(budget) : null);
    res.json(data);
  } catch (err) {
    console.error('[Marketing] budget-split error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/segment-priority', (req, res) => {
  try {
    const { timeframe } = req.query;
    const data = getSegmentSpendPriority(req.user.companyId, timeframe);
    res.json(data);
  } catch (err) {
    console.error('[Marketing] segment-priority error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/break-even', (req, res) => {
  try {
    const { timeframe } = req.query;
    const data = getBreakEvenCalculator(req.user.companyId, timeframe);
    res.json(data);
  } catch (err) {
    console.error('[Marketing] break-even error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/weekly-recommendation', (req, res) => {
  try {
    res.json(getWeeklyRecommendation(req.user.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/report-cards', (req, res) => {
  try {
    res.json(getPostSpendReportCards(req.user.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/flags', (req, res) => {
  try {
    res.json(getDoNotSpendFlags(req.user.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
