module.exports = {
  getInsights: async (companyId) => {
    return {
      vip: { count: 58, avgSpend: 4830, trend: 'Stable', recommendation: 'Launch Premium Loyalty Offer' },
      atRisk: { count: 83, reason: 'No purchase in 46 days', expectedRecovery: 42, recommendation: '10% Coupon' }
    };
  }
};
