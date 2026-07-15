module.exports = {
  getOpportunities: async (companyId) => {
    return [
      { product: 'Coca Cola', demand: '+28%', recommendation: 'Increase stock, Bundle with Chips', confidence: 94 },
      { product: 'Seasonal Umbrella', demand: '-40%', recommendation: 'Clearance sale at 30% off', confidence: 88 }
    ];
  }
};
