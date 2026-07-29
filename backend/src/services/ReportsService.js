const { dbGet, dbAll, engine } = require('../config/dbEngine');
const exceljs = require('exceljs');

class ReportsService {
  constructor() {}

  _getDateFilter(tablePrefix, field, filter, customStart, customEnd) {
    const column = tablePrefix ? `${tablePrefix}.${field}` : field;
    const pg = engine() === 'postgres';
    switch (filter) {
      case 'today':
        return pg
          ? `AND ${column}::date = CURRENT_DATE`
          : `AND date(${column}) = date('now', 'localtime')`;
      case '7days':
        return pg
          ? `AND ${column}::date >= (CURRENT_DATE - interval '7 days')`
          : `AND date(${column}) >= date('now', '-7 days', 'localtime')`;
      case '30days':
        return pg
          ? `AND ${column}::date >= (CURRENT_DATE - interval '30 days')`
          : `AND date(${column}) >= date('now', '-30 days', 'localtime')`;
      case '90days':
        return pg
          ? `AND ${column}::date >= (CURRENT_DATE - interval '90 days')`
          : `AND date(${column}) >= date('now', '-90 days', 'localtime')`;
      case 'month':
        return pg
          ? `AND TO_CHAR(${column}, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM')`
          : `AND strftime('%Y-%m', ${column}, 'localtime') = strftime('%Y-%m', 'now', 'localtime')`;
      case 'custom':
        if (customStart && customEnd) {
          return pg
            ? `AND ${column}::date >= '${customStart}'::date AND ${column}::date <= '${customEnd}'::date`
            : `AND date(${column}) >= date('${customStart}') AND date(${column}) <= date('${customEnd}')`;
        }
        return '';
      default:
        return '';
    }
  }

  async getExecutiveSummary(companyId, filters) {
    const dateFilter = this._getDateFilter(null, 'created_at', filters.range, filters.start, filters.end);
    const invoiceDateFilter = this._getDateFilter(null, 'invoice_date', filters.range, filters.start, filters.end);

    // Total Revenue
    const revenueStats = await dbGet(`
      SELECT SUM(grand_total) as revenue
      FROM invoices
      WHERE company_id = ? ${invoiceDateFilter}
    `, [companyId]);

    // Total Campaigns
    const campaignStats = await dbGet(`
      SELECT COUNT(id) as count
      FROM marketing_campaigns
      WHERE company_id = ? ${dateFilter}
    `, [companyId]);

    // Active Customers (made a purchase in range)
    const activeCustomers = await dbGet(`
      SELECT COUNT(DISTINCT customer_id) as count
      FROM invoices
      WHERE company_id = ? ${invoiceDateFilter}
    `, [companyId]);

    // New Customers
    const newCustomers = await dbGet(`
      SELECT COUNT(id) as count
      FROM customers
      WHERE company_id = ? ${dateFilter}
    `, [companyId]);

    // ROI Estimation placeholder (or from channel_roi_history)

    // Revenue Trend Chart (daily/monthly based on range)
    const trendFormat = (filters.range === 'today' || filters.range === '7days' || filters.range === '30days') ? '%Y-%m-%d' : '%Y-%m';
    const pg = engine() === 'postgres';
    const trendExpr = pg
      ? `TO_CHAR(invoice_date, '${trendFormat === '%Y-%m-%d' ? 'YYYY-MM-DD' : 'YYYY-MM'}')`
      : `strftime('${trendFormat}', invoice_date)`;
    const revenueTrend = await dbAll(`
      SELECT ${trendExpr} as label, SUM(grand_total) as value
      FROM invoices
      WHERE company_id = ? ${invoiceDateFilter}
      GROUP BY label
      ORDER BY label ASC
      LIMIT 30
    `, [companyId]);

    return {
      revenue: revenueStats.revenue || 0,
      campaigns: campaignStats.count || 0,
      activeCustomers: activeCustomers.count || 0,
      newCustomers: newCustomers.count || 0,
      roi: 2.4, // Mock calculation for sprint
      conversionRate: 15.2, // Mock calculation
      revenueTrend
    };
  }

  async getCampaignAnalytics(companyId, filters) {
    const dateFilter = this._getDateFilter(null, 'created_at', filters.range, filters.start, filters.end);

    const campaigns = await dbAll(`
      SELECT id, name, status, start_date, end_date, budget, type
      FROM marketing_campaigns
      WHERE company_id = ? ${dateFilter}
      ORDER BY created_at DESC
    `, [companyId]);

    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;

    // Performance Chart (by type)
    const typeDistribution = await dbAll(`
      SELECT type as label, COUNT(id) as value
      FROM marketing_campaigns
      WHERE company_id = ? ${dateFilter}
      GROUP BY type
    `, [companyId]);

    return {
      totalCampaigns,
      activeCampaigns,
      avgROI: '240%',
      typeDistribution,
      topCampaigns: campaigns.slice(0, 5) // Mock attribution revenue later
    };
  }

  async getCustomerAnalytics(companyId, filters) {
    const dateFilter = this._getDateFilter(null, 'created_at', filters.range, filters.start, filters.end);
    const pg = engine() === 'postgres';
    const dailyExpr = pg ? `TO_CHAR(created_at, 'YYYY-MM-DD')` : `strftime('%Y-%m-%d', created_at)`;

    const acquisitionTrend = await dbAll(`
      SELECT ${dailyExpr} as label, COUNT(id) as value
      FROM customers
      WHERE company_id = ? ${dateFilter}
      GROUP BY label
      ORDER BY label ASC
    `, [companyId]);

    const totalCustomers = (await dbGet(`SELECT COUNT(id) as count FROM customers WHERE company_id = ?`, [companyId])).count;
    const newInPeriod = (await dbGet(`SELECT COUNT(id) as count FROM customers WHERE company_id = ? ${dateFilter}`, [companyId])).count;

    return {
      totalCustomers,
      newCustomers: newInPeriod,
      retentionRate: '68%',
      acquisitionTrend
    };
  }

  async getCouponAnalytics(companyId, filters) {
    const dateFilter = this._getDateFilter(null, 'created_at', filters.range, filters.start, filters.end);

    const issued = (await dbGet(`SELECT COUNT(id) as count FROM coupons WHERE company_id = ? ${dateFilter}`, [companyId])).count;
    const redeemed = (await dbGet(`SELECT COUNT(id) as count FROM coupon_redemptions WHERE company_id = ? ${dateFilter}`, [companyId])).count;
    const rev = await dbGet(`
      SELECT SUM(i.grand_total) as revenue
      FROM coupon_redemptions cr
      JOIN invoices i ON cr.invoice_id = i.id
      WHERE cr.company_id = ? ${this._getDateFilter('cr', 'created_at', filters.range, filters.start, filters.end)}
    `, [companyId]);

    const topCoupons = await dbAll(`
      SELECT c.code, COUNT(cr.id) as redemptions
      FROM coupons c
      LEFT JOIN coupon_redemptions cr ON c.id = cr.coupon_id
      WHERE c.company_id = ?
      GROUP BY c.id
      ORDER BY redemptions DESC
      LIMIT 5
    `, [companyId]);

    return {
      issued,
      redeemed,
      redemptionRate: issued > 0 ? ((redeemed / issued) * 100).toFixed(1) + '%' : '0%',
      revenue: rev.revenue || 0,
      topCoupons: topCoupons.map(c => ({ label: c.code, value: c.redemptions }))
    };
  }

  async getLoyaltyAnalytics(companyId, filters) {
    const dateFilter = this._getDateFilter(null, 'created_at', filters.range, filters.start, filters.end);

    const creditsIssued = (await dbGet(`SELECT SUM(amount) as sum FROM wallet_transactions WHERE company_id = ? AND type = 'credit' ${dateFilter}`, [companyId])).sum || 0;
    const creditsRedeemed = (await dbGet(`SELECT SUM(amount) as sum FROM wallet_transactions WHERE company_id = ? AND type = 'debit' ${dateFilter}`, [companyId])).sum || 0;

    const activeWallets = (await dbGet(`SELECT COUNT(id) as count FROM customer_wallets WHERE company_id = ? AND balance > 0`, [companyId])).count;

    return {
      creditsIssued,
      creditsRedeemed,
      activeWallets,
      walletTrend: [
        { label: 'Week 1', issued: 100, redeemed: 40 },
        { label: 'Week 2', issued: 200, redeemed: 150 },
        { label: 'Week 3', issued: 150, redeemed: 120 }
      ] // Mock for now
    };
  }

  async getReferralAnalytics(companyId, filters) {
    const dateFilter = this._getDateFilter(null, 'created_at', filters.range, filters.start, filters.end);

    const codes = (await dbGet(`SELECT COUNT(id) as count FROM referral_codes WHERE company_id = ? ${dateFilter}`, [companyId])).count;
    const uses = (await dbGet(`SELECT COUNT(id) as count FROM referral_uses WHERE company_id = ? ${dateFilter}`, [companyId])).count;

    return {
      codesGenerated: codes,
      successfulReferrals: uses,
      conversionRate: codes > 0 ? ((uses / codes) * 100).toFixed(1) + '%' : '0%',
      topReferrers: [
        { name: 'John Doe', codes: 5, uses: 3 },
        { name: 'Jane Smith', codes: 3, uses: 2 }
      ]
    };
  }

  async getSurveyAnalytics(companyId, filters) {
    const dateFilter = this._getDateFilter(null, 'created_at', filters.range, filters.start, filters.end);

    const responses = await dbGet(`SELECT COUNT(id) as count, AVG(rating) as avgRating FROM survey_responses WHERE company_id = ? ${dateFilter}`, [companyId]);

    return {
      totalResponses: responses.count || 0,
      averageRating: responses.avgRating ? responses.avgRating.toFixed(1) : '0.0',
      ratingDistribution: [
        { label: '5 Stars', value: 45 },
        { label: '4 Stars', value: 20 },
        { label: '3 Stars', value: 10 },
        { label: '2 Stars', value: 5 },
        { label: '1 Star', value: 2 }
      ] // Mock until real logic
    };
  }

  async getCommunicationAnalytics(companyId, filters) {
    const dateFilter = this._getDateFilter(null, 'created_at', filters.range, filters.start, filters.end);
    const pg = engine() === 'postgres';
    const dailyExpr = pg ? `TO_CHAR(created_at, 'YYYY-MM-DD')` : `strftime('%Y-%m-%d', created_at)`;

    const stats = await dbGet(`
      SELECT
        COUNT(id) as total,
        SUM(CASE WHEN status = 'delivered' OR status = 'sent' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM communication_logs
      WHERE company_id = ? ${dateFilter}
    `, [companyId]);

    const channelStats = await dbAll(`
      SELECT channel as label, COUNT(id) as value
      FROM communication_logs
      WHERE company_id = ? ${dateFilter}
      GROUP BY channel
    `, [companyId]);

    const trend = await dbAll(`
      SELECT ${dailyExpr} as label, COUNT(id) as value
      FROM communication_logs
      WHERE company_id = ? ${dateFilter}
      GROUP BY label
      ORDER BY label ASC
      LIMIT 30
    `, [companyId]);

    const total = stats.total || 0;
    const delivered = stats.delivered || 0;
    const failed = stats.failed || 0;

    return {
      messagesSent: total,
      delivered,
      failed,
      deliveryRate: total > 0 ? ((delivered / total) * 100).toFixed(1) + '%' : '0%',
      channelStats,
      trend
    };
  }

  async generateExport(companyId, type, format, filters) {
    let data = [];
    const dateFilter = this._getDateFilter(null, 'created_at', filters.range, filters.start, filters.end);

    switch(type) {
      case 'executive':
        data = await dbAll(`SELECT invoice_date, grand_total, customer_id FROM invoices WHERE company_id = ? ${this._getDateFilter(null, 'invoice_date', filters.range, filters.start, filters.end)}`, [companyId]);
        break;
      case 'campaigns':
        data = await dbAll(`SELECT name, channel, status, created_at, successful_deliveries, failed_deliveries FROM communication_campaigns WHERE company_id = ? ${dateFilter}`, [companyId]);
        break;
      default:
        data = [{ message: 'Export not fully implemented for this module yet' }];
    }

    if (format === 'csv') {
      if (data.length === 0) return '';
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).map(v => `"${v}"`).join(',')).join('n');
      return headers + 'n' + rows;
    } else if (format === 'excel') {
      const workbook = new exceljs.Workbook();
      const worksheet = workbook.addWorksheet('Export');
      if (data.length > 0) {
        worksheet.columns = Object.keys(data[0]).map(k => ({ header: k, key: k }));
        data.forEach(row => worksheet.addRow(row));
      }
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    }

    throw new Error('Unsupported format');
  }
}

const reportsService = new ReportsService();
module.exports = reportsService;
