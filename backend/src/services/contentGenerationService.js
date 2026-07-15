const { getDb } = require('../config/db');
const { getClient, safeParseJSON } = require('./marketingAI');

/**
 * contentGenerationService
 * Generates campaign copy, audiences, and offers using OpenAI.
 */

async function draftCampaign(intent, companyId) {
  const client = getClient();
  const CHAT_MODEL = process.env.CHAT_MODEL || 'llama-3.3-70b-versatile';

  const prompt = \`You are an expert Marketing Copilot for a small retail business in India.
The business owner has provided this goal/intent for a new campaign:
"\${intent}"

Draft a complete campaign that includes the audience, offer, budget, and multi-channel copy.
Return ONLY valid JSON in this exact structure:
{
  "campaignName": "Catchy name",
  "description": "Brief description of the campaign",
  "audience": "Description of the target audience segment (e.g. 'VIP customers inactive for 30 days')",
  "offer": "Clear offer description (e.g. 'Flat 20% off', 'Buy 2 Get 1 Free')",
  "budget": 2000,
  "expectedRevenue": 15000,
  "confidence": 88,
  "copy": {
    "whatsapp": "Namaste! Special offer inside...",
    "sms": "Offer inside! Visit us.",
    "email": {
      "subject": "Special Offer for You",
      "body": "Dear customer, we miss you..."
    }
  }
}\`;

  if (!client) {
    console.log('[ContentGeneration] No API key, using mock response.');
    return {
      campaignName: "Monsoon Family Combo",
      description: "A combination deal to increase average order value.",
      audience: "Families who visited within last 60 days.",
      offer: "Buy 2 Get 1",
      budget: 2000,
      expectedRevenue: 17500,
      confidence: 87,
      copy: {
        whatsapp: "Namaste! Monsoon is here and so is our family combo offer. Buy 2 and get 1 absolutely free. Visit us today!",
        sms: "Monsoon offer! Buy 2 Get 1 free on all family packs. Visit us today.",
        email: {
          subject: "Monsoon Special: Buy 2 Get 1 Free!",
          body: "Hello! We have a special monsoon treat for your family..."
        }
      }
    };
  }

  try {
    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const raw = response.choices[0].message.content.trim();
    return safeParseJSON(raw, 'draftCampaign');
  } catch (err) {
    console.error('[ContentGeneration] AI Generation error:', err.message);
    throw new Error('Failed to generate campaign draft.');
  }
}

module.exports = {
  draftCampaign
};
