const { getDb } = require('../config/db');

function calculateCampaignROI(campaignId, companyId) {
  const db = getDb();
  try {
    const campaign = db.prepare('SELECT * FROM marketing_campaigns WHERE id = ? AND company_id = ?').get(campaignId, companyId);
    if (!campaign) throw new Error('Campaign not found.');

    // Only active or completed/paused campaigns should have ROI calculated
    if (campaign.status === 'draft' || campaign.status === 'ready' || !campaign.launched_at) {
      return {
        campaign_id: campaignId,
        customers_targeted: campaign.customers_targeted || 0,
        customers_converted: 0,
        actual_revenue: 0,
        conversion_rate: 0,
        roi: null,
        roi_status: 'not_launched'
      };
    }

    // Get target customers from the targets table
    const targets = db.prepare('SELECT customer_id FROM marketing_campaign_targets WHERE campaign_id = ?').all(campaignId);
    const targetIds = targets.map(t => t.customer_id);

    if (targetIds.length === 0) {
      return {
        campaign_id: campaignId,
        customers_targeted: 0,
        customers_converted: 0,
        actual_revenue: 0,
        conversion_rate: 0,
        roi: null,
        roi_status: 'no_targets'
      };
    }

    // Find sales post-launch for these customers
    const placeholders = targetIds.map(() => '?').join(',');
    
    // We bind the launched_at and optionally completed_at (or just current time)
    const endDate = campaign.completed_at || new Date().toISOString();

    const sales = db.prepare(`
      SELECT customer_id, SUM(revenue) as rev 
      FROM sales 
      WHERE customer_id IN (${placeholders}) 
        AND sale_date >= ? AND sale_date <= ?
      GROUP BY customer_id
    `).all(...targetIds, campaign.launched_at, endDate);

    const customers_converted = sales.length;
    const actual_revenue = sales.reduce((sum, row) => sum + row.rev, 0);
    const conversion_rate = targetIds.length > 0 ? (customers_converted / targetIds.length) : 0;
    
    let roi = null;
    let roi_status = 'calculated';

    if (campaign.campaign_cost === null) {
      roi_status = 'cost_not_provided';
    } else {
      if (campaign.campaign_cost === 0) {
        // Technically infinite, but we can return actual_revenue or cap it. Let's just say 0 means no cost = ROI is actual_revenue?
        // Let's stick to standard math and avoid infinity. We can set it to actual_revenue just for metrics.
        roi = actual_revenue > 0 ? 100 : 0; // 100x return
      } else {
        roi = (actual_revenue - campaign.campaign_cost) / campaign.campaign_cost;
      }
    }

    // Persist performance metrics
    db.prepare(`
      UPDATE marketing_campaigns 
      SET customers_converted = ?, 
          actual_revenue = ?, 
          conversion_rate = ?, 
          roi = ? 
      WHERE id = ?
    `).run(customers_converted, actual_revenue, conversion_rate, roi, campaignId);

    return {
      campaign_id: campaignId,
      customers_targeted: targetIds.length,
      customers_converted,
      actual_revenue,
      conversion_rate,
      roi,
      roi_status
    };

  } finally {
    db.close();
  }
}

module.exports = {
  calculateCampaignROI
};
