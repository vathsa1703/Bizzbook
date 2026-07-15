const BaseProvider = require('./BaseProvider');
const crypto = require('crypto');

class MockProvider extends BaseProvider {
  async send(payload) {
    // Simulate network delay between 50ms and 200ms
    const delay = Math.floor(Math.random() * 150) + 50;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Support deterministic failure simulation based on payload metadata
    if (payload.metadata?.simulateFailure) {
      return {
        success: false,
        providerMessageId: null,
        error: 'Simulated provider failure'
      };
    }

    return {
      success: true,
      providerMessageId: `mock_${crypto.randomUUID()}`,
      error: null
    };
  }
}

module.exports = MockProvider;
