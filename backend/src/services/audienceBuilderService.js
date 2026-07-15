module.exports = {
  translateToRules: async (naturalLanguageIntent) => {
    return [
      { field: 'segment', operator: '=', value: 'VIP' },
      { field: 'last_visit_days', operator: '>', value: 30 }
    ];
  }
};
