const cron = require('node-cron');
const { getDb } = require('../config/db');
const { getMarketingOpportunities } = require('../services/marketingEngine');
const { getDashboardInsights } = require('../services/insightEngine');

async function executeMarketingCron(companyIdParam = null) {
  const db = getDb();
  try {
    let companies = [];
    if (companyIdParam) {
      companies = [{ id: companyIdParam }];
    } else {
      companies = db.prepare("SELECT id FROM companies WHERE status = 'Active'").all();
    }

    console.log(`[MarketingCron] Starting run for ${companies.length} companies...`);

    for (const company of companies) {
      const companyId = company.id;
      
      // Clear old edges and signals to prevent infinite duplication
      // In a real system, you might want to retain history and diff, but for MVP, rebuilding is safest.
      db.prepare('DELETE FROM knowledge_graph_edges WHERE company_id = ?').run(companyId);
      db.prepare('DELETE FROM marketing_signals WHERE company_id = ?').run(companyId);

      // 1. Run the 4 Opportunity Engines
      // forceRefresh = true to bypass cache
      const opportunities = (await getMarketingOpportunities(companyId, true)) || [];

      // Insert signals and edges for opportunities
      for (const opp of opportunities) {
        // marketing_signals insertion
        db.prepare(`
          INSERT INTO marketing_signals (
            company_id, engine_type, entity_type, entity_id, signal_name, signal_value, confidence_score, urgency_score, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          companyId, opp.type, 'campaign_opportunity', null, opp.name, opp.expectedImpact, opp.confidenceScore, opp.urgencyScore, JSON.stringify(opp.evidence)
        );

        // knowledge_graph_edges mapping
        if (opp.type === 'revenue_recovery') {
          // Revenue Recovery → customer → has_overdue_invoice → credit
          for (const c of opp.evidence.cohort) {
            db.prepare(`
              INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(companyId, 'customer', c.id.toString(), 'has_overdue_invoice', 'credit', null, 1.0, JSON.stringify({ amount: c.amount }));
          }
        } else if (opp.type === 'customer_retention') {
          // Customer Retention → customer → is_at_risk
          for (const c of opp.evidence.cohort) {
            db.prepare(`
              INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(companyId, 'customer', c.id.toString(), 'is_at_risk', 'status', null, 1.0, JSON.stringify({ days_inactive: c.days_inactive }));
          }
        } else if (opp.type === 'dead_stock_liquidation') {
          // Dead Stock Liquidation → product → is_dead_stock
          for (const c of opp.evidence.cohort) {
            db.prepare(`
              INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(companyId, 'product', c.name, 'is_dead_stock', 'status', null, 1.0, JSON.stringify({ locked_capital: c.capital }));
          }
        } else if (opp.type === 'cross_sell') {
          // Cross-Sell → customer → has_affinity_for → product
          for (const c of opp.evidence.cohort) {
            db.prepare(`
              INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(companyId, 'customer', c.id.toString(), 'has_affinity_for', 'product', c.target_product, 1.0, JSON.stringify({}));
          }
        }
      }

      // 2. Run the 4 Rule-Based Insight Engines
      const dashboardData = (await getDashboardInsights(companyId)) || { insights: [] };
      for (const insight of dashboardData.insights) {
        
        // marketing_signals insertion
        db.prepare(`
          INSERT INTO marketing_signals (
            company_id, engine_type, entity_type, entity_id, signal_name, signal_value, confidence_score, urgency_score, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(companyId, insight.type, 'insight', null, insight.headline, 0, 100, insight.severity === 'urgent' ? 90 : 50, JSON.stringify({ subtext: insight.subtext }));

        // knowledge_graph_edges mapping
        if (insight.type === 'slow_moving_stock') {
          // Slow-Moving Stock → product → is_slow_moving
          const productId = insight.action.route.split('=')[1];
          db.prepare(`
            INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(companyId, 'product', productId, 'is_slow_moving', 'status', null, 1.0, JSON.stringify({ subtext: insight.subtext }));
        } else if (insight.type === 'best_seller_identified') {
          // Best Seller Identified → product → is_best_seller
          // Regex extract name from headline (e.g. Double down on "Product Name")
          const match = insight.headline.match(/"([^"]+)"/);
          const productName = match ? match[1] : 'Unknown';
          db.prepare(`
            INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(companyId, 'product', productName, 'is_best_seller', 'status', null, 1.0, JSON.stringify({ subtext: insight.subtext }));
        } else if (insight.type === 'revenue_growth') {
          // Revenue Growth Milestone → company → has_growth_milestone
          const momMatch = insight.headline.match(/by (\d+)%/);
          const momPercent = momMatch ? parseInt(momMatch[1], 10) : null;
          db.prepare(`
            INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(companyId, 'company', companyId.toString(), 'has_growth_milestone', 'status', null, 1.0, JSON.stringify({ mom_percent: momPercent }));
        } else if (insight.type === 'healthy_repeat_rate') {
          // Healthy Repeat Rate → company → has_healthy_repeat_rate
          const repeatMatch = insight.headline.match(/at (\d+)%/);
          const repeatPercent = repeatMatch ? parseInt(repeatMatch[1], 10) : null;
          db.prepare(`
            INSERT INTO knowledge_graph_edges (company_id, node_a_type, node_a_id, relationship_type, node_b_type, node_b_id, weight, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(companyId, 'company', companyId.toString(), 'has_healthy_repeat_rate', 'status', null, 1.0, JSON.stringify({ repeat_percent: repeatPercent }));
        }
      }
    }
    console.log(`[MarketingCron] Successfully completed run for ${companies.length} companies.`);
    return { success: true, count: companies.length };
  } catch (err) {
    console.error('[MarketingCron] Error during execution:', err);
    return { success: false, error: err.message };
  } finally {
    db.close();
  }
}

// Schedule nightly run at 2:00 AM
function initCron() {
  console.log('[MarketingCron] Initializing nightly job at 02:00 AM.');
  cron.schedule('0 2 * * *', () => {
    console.log('[MarketingCron] Triggering scheduled nightly run.');
    executeMarketingCron();
  });
}

module.exports = {
  initCron,
  executeMarketingCron
};
