const express = require('express');
const { getMarketingOpportunities, getOpportunityById } = require('../services/marketingEngine');
const { generateCampaign } = require('../services/marketingAI');
const { getAllSegmentSummaries, getSegmentCustomers } = require('../services/segmentationEngine');
const { calculateCampaignROI } = require('../services/roiEngine');
const { calculateStoreHealthScore, getChannelROIRanking, getSuggestedBudgetSplit, getSegmentSpendPriority, getBreakEvenCalculator, getWeeklyRecommendation, getPostSpendReportCards, getDoNotSpendFlags } = require('../services/spendIntelligenceEngine');
const { dbGet, dbAll } = require('../config/dbEngine');
const { withTransaction } = require('../config/pgDb');
const { withBranchScope } = require('../utils/BranchScopedQuery');
const { marketingAiRateLimit } = require('../middleware/aiRateLimit');

const router = express.Router();

// ─── 1. Opportunities ────────────────────────────────────────────────────────

// GET /api/marketing/opportunities
router.get('/opportunities', async (req, res) => {
  try {
    const opportunities = await getMarketingOpportunities(req.user.companyId);
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
router.get('/segments', async (req, res) => {
  try {
    const segments = await getAllSegmentSummaries(req.user.companyId);
    res.json({ segments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/segments/:segmentId/customers
router.get('/segments/:segmentId/customers', async (req, res) => {
  try {
    const customers = await getSegmentCustomers(req.params.segmentId, req.user.companyId);
    res.json({ customers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. Campaigns ────────────────────────────────────────────────────────────

// GET /api/marketing/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    let query = 'SELECT * FROM marketing_campaigns WHERE company_id = ?';
    let params = [req.user.companyId];

    const scoped = withBranchScope(query, params, req.scopeContext, 'branch_id');
    scoped.sql += ' ORDER BY created_at DESC';

    const rows = await dbAll(scoped.sql, scoped.params);
    // Parse JSON snapshot and ai_content if needed for frontend
    const campaigns = rows.map(r => ({
      ...r,
      campaign_snapshot: r.campaign_snapshot ? JSON.parse(r.campaign_snapshot) : null,
      ai_content: r.ai_content ? JSON.parse(r.ai_content) : null
    }));
    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/campaigns/:id
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await dbGet('SELECT * FROM marketing_campaigns WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    campaign.campaign_snapshot = campaign.campaign_snapshot ? JSON.parse(campaign.campaign_snapshot) : null;
    campaign.ai_content = campaign.ai_content ? JSON.parse(campaign.ai_content) : null;
    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/marketing/campaigns/generate
router.post('/campaigns/generate', marketingAiRateLimit, async (req, res) => {
  const { segmentId, opportunityId, objective, coupon_id, channel } = req.body;
  if (!objective) return res.status(400).json({ error: 'objective required' });
  if (!segmentId && !opportunityId) return res.status(400).json({ error: 'segmentId or opportunityId required' });

  try {
    let aiContent, snapshot, customers = [];
    let campaignType = 'segment_campaign';
    let expectedImpact = 0;
    let targetSegment = segmentId || null;

    if (opportunityId) {
      const opp = await getOpportunityById(opportunityId, req.user.companyId);
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
      customers = await getSegmentCustomers(segmentId, req.user.companyId);
      if (customers.length === 0) return res.status(400).json({ error: 'Segment has no customers' });

      const segmentSummaries = await getAllSegmentSummaries(req.user.companyId);
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
    let campaignId;

    // Save Campaign + Targets atomically
    campaignId = await withTransaction(async (tx) => {
      const row = await tx.getOne(`
        INSERT INTO marketing_campaigns
        (name, type, segment, objective, target_count, expected_impact, status, campaign_snapshot, ai_content, opportunity_id, company_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
      `, [
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
      ]);
      const id = row.id;

      if (coupon_id) {
        await tx.query('UPDATE coupons SET campaign_id = ? WHERE id = ? AND company_id = ?', [id, coupon_id, companyId]);
      }

      if (customers.length > 0) {
        for (const c of customers) {
          await tx.query('INSERT INTO marketing_campaign_targets (campaign_id, customer_id, company_id) VALUES (?, ?, ?)', [id, c.customer_id, companyId]);
        }
      }

      return id;
    });

    const campaign = await dbGet('SELECT * FROM marketing_campaigns WHERE id = ?', [campaignId]);
    campaign.campaign_snapshot = JSON.parse(campaign.campaign_snapshot);
    campaign.ai_content = JSON.parse(campaign.ai_content);

    res.status(201).json({ campaign });
  } catch (err) {
    console.error('[Marketing] generate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/marketing/campaigns/:id
router.put('/campaigns/:id', async (req, res) => {
  const { status, notes, campaign_cost } = req.body;
  try {
    const existing = await dbGet('SELECT * FROM marketing_campaigns WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (!existing) return res.status(404).json({ error: 'Campaign not found' });

    let launchedAt = existing.launched_at;
    let completedAt = existing.completed_at;

    // Update timestamps based on status
    if (status === 'active' && !launchedAt) {
      launchedAt = new Date().toISOString();
    } else if (status === 'completed' && !completedAt) {
      completedAt = new Date().toISOString();
    }

    await dbGet(`
      UPDATE marketing_campaigns
      SET status = COALESCE(?, status),
          notes = COALESCE(?, notes),
          campaign_cost = COALESCE(?, campaign_cost),
          launched_at = ?,
          completed_at = ?
      WHERE id = ?
    `, [
      status ?? null,
      notes ?? null,
      campaign_cost ?? null,
      launchedAt ?? null,
      completedAt ?? null,
      req.params.id
    ]);

    const campaign = await dbGet('SELECT * FROM marketing_campaigns WHERE id = ?', [req.params.id]);
    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/campaigns/:id/performance
router.get('/campaigns/:id/performance', async (req, res) => {
  try {
    const performance = await calculateCampaignROI(req.params.id, req.user.companyId);
    res.json({ performance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/marketing/campaigns/:id/export/csv
router.get('/campaigns/:id/export/csv', async (req, res) => {
  try {
    const campaign = await dbGet('SELECT * FROM marketing_campaigns WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const aiContent = campaign.ai_content ? JSON.parse(campaign.ai_content) : {};
    const msg = aiContent.whatsappMessage || aiContent.smsMessage || '';

    const targets = await dbAll(`
      SELECT c.name, c.phone, c.email
      FROM marketing_campaign_targets t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.campaign_id = ?
    `, [campaign.id]);

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
  }
});

// ─── 4. Dashboard ────────────────────────────────────────────────────────────

// GET /api/marketing/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // Basic stats from campaigns
    const stats = await dbGet(`
      SELECT
        COUNT(CASE WHEN status = 'active' THEN 1 END) as activeCampaigns,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as campaignsCompleted,
        SUM(CASE WHEN status IN ('completed', 'active') THEN actual_revenue ELSE 0 END) as totalRecoveredRevenue,
        AVG(CASE WHEN roi IS NOT NULL THEN roi ELSE NULL END) as averageROI
      FROM marketing_campaigns
    `, []);

    // Top performing campaign
    const topCampaign = await dbGet(`
      SELECT id, name, actual_revenue as revenue, roi
      FROM marketing_campaigns
      WHERE roi IS NOT NULL
      ORDER BY roi DESC LIMIT 1
    `, []);

    // Phase 1: Omnichannel & Coupon Stats
    const omnichannelStats = await dbGet(`
      SELECT
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as totalSent,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as totalDelivered,
        COUNT(CASE WHEN status = 'read' THEN 1 END) as totalRead
      FROM communication_logs
      WHERE company_id = ?
    `, [req.user.companyId]);

    const couponStats = await dbGet(`
      SELECT
        COUNT(id) as redemptions,
        SUM(discount_applied) as totalDiscount
      FROM coupon_redemptions
      WHERE company_id = ?
    `, [req.user.companyId]);

    // Re-use engine data
    const opps = await getMarketingOpportunities(req.user.companyId);
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
  }
});

// Add manual POST /api/marketing/campaigns backwards compatibility just in case
router.post('/campaigns', async (req, res) => {
  const { opportunity_id, name, type, target_count, expected_impact, notes } = req.body;
  try {
    const companyId = req.user.companyId;
    const row = await dbGet(
      'INSERT INTO marketing_campaigns (opportunity_id, name, type, target_count, expected_impact, notes, status, company_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
      [opportunity_id || null, name, type || 'manual', target_count || 0, expected_impact || 0, notes, 'draft', companyId]
    );
    const campaign = await dbGet('SELECT * FROM marketing_campaigns WHERE id = ?', [row.id]);
    res.status(201).json({ campaign });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/marketing/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
  try {
    const existing = await dbGet('SELECT id FROM marketing_campaigns WHERE id = ? AND company_id = ?', [req.params.id, req.user.companyId]);
    if (!existing) return res.status(404).json({ error: 'Campaign not found' });

    await withTransaction(async (tx) => {
      await tx.query('DELETE FROM marketing_campaign_targets WHERE campaign_id = ?', [req.params.id]);
      await tx.query('DELETE FROM marketing_campaigns WHERE id = ?', [req.params.id]);
    });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================================
// PHASE 1: CORE MARKETING FOUNDATION
// =============================================================================

// ─── 5. Customer Wallet ──────────────────────────────────────────────────────

router.get('/wallet/:customerId', async (req, res) => {
  try {
    const balances = await dbAll('SELECT balance_type, balance FROM customer_wallets WHERE customer_id = ? AND company_id = ?', [req.params.customerId, req.user.companyId]);
    res.json({ balances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/wallet/adjust', async (req, res) => {
  try {
    const { customer_id, balance_type, amount, transaction_type, reference_id, description } = req.body;
    const companyId = req.user.companyId;
    // Knowledge Graph insertion (Phase 1 rule)
    const relType = amount >= 0 ? 'earned_reward' : 'burned_reward';

    let newBalance;

    newBalance = await withTransaction(async (tx) => {
      // Ensure wallet exists
      let wallet = await tx.getOne('SELECT id, balance FROM customer_wallets WHERE customer_id = ? AND balance_type = ?', [customer_id, balance_type || 'store_credit']);
      if (!wallet) {
        const row = await tx.getOne('INSERT INTO customer_wallets (company_id, customer_id, balance_type, balance) VALUES (?, ?, ?, 0) RETURNING id', [companyId, customer_id, balance_type || 'store_credit']);
        wallet = { id: row.id, balance: 0 };
      }

      const nb = wallet.balance + amount;
      await tx.query(`UPDATE customer_wallets SET balance = ?, updated_at = now() WHERE id = ?`, [nb, wallet.id]);

      await tx.query('INSERT INTO wallet_transactions (company_id, wallet_id, amount, transaction_type, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)',
        [companyId, wallet.id, amount, transaction_type, reference_id || null, description || null]);

      await tx.query('INSERT INTO marketing_signals (company_id, engine_type, entity_type, entity_id, signal_name, signal_value, confidence_score, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [companyId, 'wallet', 'customer', customer_id, `Wallet Adjustment: ${transaction_type}`, amount, 100, JSON.stringify({ balance_type })]);

      await tx.query('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [companyId, 'customer', customer_id, relType, 'wallet', wallet.id, Math.abs(amount)]);

      return nb;
    });

    res.json({ success: true, newBalance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. Custom Segments ──────────────────────────────────────────────────────

router.post('/segments', async (req, res) => {
  try {
    const { name, description, logic_type, rules } = req.body;
    const companyId = req.user.companyId;
    let segmentId;

    segmentId = await withTransaction(async (tx) => {
      const row = await tx.getOne('INSERT INTO custom_segments (company_id, name, description, segment_type, logic_type) VALUES (?, ?, ?, ?, ?) RETURNING id',
        [companyId, name, description, 'rule_based', logic_type || 'AND']);
      const id = row.id;

      for (const r of rules || []) {
        await tx.query('INSERT INTO segment_rules (segment_id, rule_type, operator, value) VALUES (?, ?, ?, ?)', [id, r.rule_type, r.operator, r.value]);
      }

      return id;
    });

    res.json({ success: true, segmentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. Coupons ──────────────────────────────────────────────────────────────

router.get('/coupons', async (req, res) => {
  try {
    const coupons = await dbAll('SELECT * FROM coupons WHERE company_id = ?', [req.user.companyId]);
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/coupons', async (req, res) => {
  try {
    const { code, discount_type, discount_value, min_order_value, max_discount, target_segment_id, usage_limit, expires_at, campaign_id } = req.body;
    const row = await dbGet(`
      INSERT INTO coupons (company_id, campaign_id, code, discount_type, discount_value, min_order_value, max_discount, target_segment_id, usage_limit, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `, [req.user.companyId, campaign_id || null, code, discount_type, discount_value, min_order_value || 0, max_discount || null, target_segment_id || null, usage_limit || null, expires_at || null]);
    res.json({ success: true, couponId: row.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/coupons/validate', async (req, res) => {
  try {
    const { code, customer_id, cart_value } = req.body;
    const coupon = await dbGet('SELECT * FROM coupons WHERE code = ? AND company_id = ?', [code, req.user.companyId]);

    if (!coupon) return res.status(404).json({ valid: false, error: 'Coupon not found.' });
    if (coupon.usage_limit && coupon.times_used >= coupon.usage_limit) return res.status(400).json({ valid: false, error: 'Coupon usage limit reached.' });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(400).json({ valid: false, error: 'Coupon expired.' });
    if (coupon.min_order_value && cart_value < coupon.min_order_value) return res.status(400).json({ valid: false, error: `Minimum order value is ₹${coupon.min_order_value}.` });

    res.json({ valid: true, coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOTE: coupon redemption endpoint (or logic) is handled when an invoice is created, but for pure API completion:
router.post('/coupons/redeem', async (req, res) => {
  try {
    const { coupon_id, customer_id, invoice_id, discount_applied } = req.body;
    const companyId = req.user.companyId;

    await withTransaction(async (tx) => {
      await tx.query('INSERT INTO coupon_redemptions (company_id, coupon_id, customer_id, invoice_id, discount_applied) VALUES (?, ?, ?, ?, ?)',
        [companyId, coupon_id, customer_id, invoice_id || null, discount_applied]);
      await tx.query('UPDATE coupons SET times_used = times_used + 1 WHERE id = ?', [coupon_id]);

      // Knowledge Graph
      await tx.query('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [companyId, 'customer', customer_id, 'redeemed_coupon', 'coupon', coupon_id, discount_applied]);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 8. Referrals ────────────────────────────────────────────────────────────

router.get('/referrals/:customerId', async (req, res) => {
  try {
    let referral = await dbGet('SELECT * FROM referral_codes WHERE customer_id = ? AND company_id = ?', [req.params.customerId, req.user.companyId]);
    if (!referral) {
      const code = `REF${req.params.customerId}${Math.random().toString(36).substring(2,6).toUpperCase()}`;
      await dbGet('INSERT INTO referral_codes (company_id, customer_id, code, reward_referrer, reward_referee) VALUES (?, ?, ?, ?, ?)',
        [req.user.companyId, req.params.customerId, code, 50, 50]); // Default 50 reward
      referral = await dbGet('SELECT * FROM referral_codes WHERE customer_id = ? AND company_id = ?', [req.params.customerId, req.user.companyId]);
    }
    res.json({ referral });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/referrals/redeem', async (req, res) => {
  try {
    const { code, new_customer_id } = req.body;
    const companyId = req.user.companyId;
    const referral = await dbGet('SELECT * FROM referral_codes WHERE code = ? AND company_id = ?', [code, companyId]);
    if (!referral) return res.status(404).json({ error: 'Invalid referral code.' });
    if (referral.customer_id === new_customer_id) return res.status(400).json({ error: 'Cannot refer yourself.' });

    await withTransaction(async (tx) => {
      await tx.query('INSERT INTO referral_uses (company_id, referral_id, new_customer_id) VALUES (?, ?, ?)',
        [companyId, referral.id, new_customer_id]);

      // Credit Referrer
      let rWallet = await tx.getOne('SELECT id, balance FROM customer_wallets WHERE customer_id = ? AND balance_type = ?', [referral.customer_id, 'reward_points']);
      if (!rWallet) {
        const row = await tx.getOne('INSERT INTO customer_wallets (company_id, customer_id, balance_type, balance) VALUES (?, ?, ?, 0) RETURNING id',
          [companyId, referral.customer_id, 'reward_points']);
        rWallet = { id: row.id, balance: 0 };
      }
      await tx.query('UPDATE customer_wallets SET balance = balance + ? WHERE id = ?', [referral.reward_referrer, rWallet.id]);
      await tx.query('INSERT INTO wallet_transactions (company_id, wallet_id, amount, transaction_type, description) VALUES (?, ?, ?, ?, ?)',
        [companyId, rWallet.id, referral.reward_referrer, 'earn', 'Referral reward']);

      // Credit Referee -- the response has always claimed this happens
      // (`reward_referee` in the JSON), but nothing ever actually applied it;
      // mirrors the referrer-crediting block above exactly.
      let refereeWallet = await tx.getOne('SELECT id, balance FROM customer_wallets WHERE customer_id = ? AND balance_type = ?', [new_customer_id, 'reward_points']);
      if (!refereeWallet) {
        const row = await tx.getOne('INSERT INTO customer_wallets (company_id, customer_id, balance_type, balance) VALUES (?, ?, ?, 0) RETURNING id',
          [companyId, new_customer_id, 'reward_points']);
        refereeWallet = { id: row.id, balance: 0 };
      }
      await tx.query('UPDATE customer_wallets SET balance = balance + ? WHERE id = ?', [referral.reward_referee, refereeWallet.id]);
      await tx.query('INSERT INTO wallet_transactions (company_id, wallet_id, amount, transaction_type, description) VALUES (?, ?, ?, ?, ?)',
        [companyId, refereeWallet.id, referral.reward_referee, 'earn', 'Referral welcome reward']);

      // Knowledge Graph
      await tx.query('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [companyId, 'customer', referral.customer_id, 'referred', 'customer', new_customer_id, referral.reward_referrer]);
    });

    res.json({ success: true, reward_referee: referral.reward_referee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 9. Feedback Surveys ─────────────────────────────────────────────────────

router.post('/surveys/send', async (req, res) => {
  try {
    const { campaign_id, invoice_id, type, question_text } = req.body;
    const row = await dbGet('INSERT INTO feedback_surveys (company_id, campaign_id, invoice_id, type, question_text) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [req.user.companyId, campaign_id || null, invoice_id || null, type, question_text]);
    res.json({ success: true, surveyId: row.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/surveys/submit', async (req, res) => {
  try {
    const { survey_id, customer_id, rating, feedback_text } = req.body;
    const companyId = req.user.companyId;

    await withTransaction(async (tx) => {
      await tx.query('INSERT INTO survey_responses (company_id, survey_id, customer_id, rating, feedback_text) VALUES (?, ?, ?, ?, ?)',
        [companyId, survey_id, customer_id, rating, feedback_text]);

      // Knowledge Graph
      await tx.query('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [companyId, 'customer', customer_id, 'left_rating', 'survey', survey_id, rating]);

      await tx.query('INSERT INTO marketing_signals (company_id, engine_type, entity_type, entity_id, signal_name, signal_value, confidence_score) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [companyId, 'feedback', 'customer', customer_id, `Customer Satisfaction Rating`, rating, 100]);
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 10. Omnichannel Delivery ────────────────────────────────────────────────

router.post('/communications/send', async (req, res) => {
  try {
    const { customer_id, campaign_id, channel, message_payload } = req.body;
    const companyId = req.user.companyId;

    // MOCK ADAPTER INTERFACE
    // In Phase 1, we just mock the send and insert into DB.
    console.log(`[Omnichannel Mock] Sending ${channel} to customer ${customer_id}: ${message_payload}`);

    const logId = await withTransaction(async (tx) => {
      const row = await tx.getOne('INSERT INTO communication_logs (company_id, customer_id, campaign_id, channel, status, message_payload) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
        [companyId, customer_id, campaign_id || null, channel, 'sent', message_payload]);

      if (campaign_id) {
        await tx.query('INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [companyId, 'campaign', campaign_id, 'sent_message_to', 'customer', customer_id, 1.0]);
      }

      return row.id;
    });

    res.json({ success: true, logId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/communications/webhook', async (req, res) => {
  try {
    const { log_id, status } = req.body;
    await dbGet('UPDATE communication_logs SET status = ? WHERE id = ? AND company_id = ?', [status, log_id, req.user.companyId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 11. Spend Intelligence ──────────────────────────────────────────────────

router.get('/health-score', async (req, res) => {
  try {
    const health = await calculateStoreHealthScore(req.user.companyId);
    res.json(health);
  } catch (err) {
    console.error('[Marketing] health-score error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/channel-roi', async (req, res) => {
  try {
    const data = await getChannelROIRanking(req.user.companyId);
    res.json(data);
  } catch (err) {
    console.error('[Marketing] channel-roi error:', err);
    res.status(500).json({ error: err.message });
  }
});
router.post('/budget-split', async (req, res) => {
  try {
    const { budget } = req.body;
    const data = await getSuggestedBudgetSplit(req.user.companyId, budget ? Number(budget) : null);
    res.json(data);
  } catch (err) {
    console.error('[Marketing] budget-split error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/segment-priority', async (req, res) => {
  try {
    const { timeframe } = req.query;
    const data = await getSegmentSpendPriority(req.user.companyId, timeframe);
    res.json(data);
  } catch (err) {
    console.error('[Marketing] segment-priority error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/break-even', async (req, res) => {
  try {
    const { timeframe } = req.query;
    const data = await getBreakEvenCalculator(req.user.companyId, timeframe);
    res.json(data);
  } catch (err) {
    console.error('[Marketing] break-even error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/weekly-recommendation', async (req, res) => {
  try {
    res.json(await getWeeklyRecommendation(req.user.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/report-cards', async (req, res) => {
  try {
    res.json(await getPostSpendReportCards(req.user.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/flags', async (req, res) => {
  try {
    res.json(await getDoNotSpendFlags(req.user.companyId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
