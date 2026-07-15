module.exports = {
  predictCampaign: async (campaignData) => {
    return {
      expectedRevenue: campaignData.budget ? campaignData.budget * 4.2 : 5000,
      expectedReach: 1200,
      confidence: 88,
      roi: 4.2,
      riskScore: 'Low'
    };
  }
};
