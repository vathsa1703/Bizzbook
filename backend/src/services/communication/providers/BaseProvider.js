class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Send a message
   * @param {Object} payload 
   * @param {string} payload.to 
   * @param {string} payload.content 
   * @param {Object} payload.metadata 
   * @returns {Promise<{success: boolean, providerMessageId: string, error: string}>}
   */
  async send(payload) {
    throw new Error('Not implemented');
  }
}

module.exports = BaseProvider;
