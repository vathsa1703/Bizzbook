const OpenAI = require('openai');

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'YOUR_API_KEY_HERE') return null;
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

function safeParseJSON(raw, context) {
  try {
    let clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error(`\n[MarketingAI] JSON Parse Error in ${context}`);
    console.error('Exception:', err.message);
    console.error('Raw Model Response:\n', raw, '\n');
    throw new Error(`AI generated invalid JSON: ${err.message}`);
  }
}

function buildCampaignPrompt(opportunity, objective) {
  const evidenceBullets = opportunity.evidence.metrics.map(m => `- ${m}`).join('\n');
  const cohortSample = opportunity.evidence.cohort.slice(0, 5);

  let cohortDescription = cohortSample.map(c => `  • ${JSON.stringify(c)}`).join('\n');

  return `You are an expert business advisor and marketer for a small Indian retail/MSME business. 
You are generating a complete marketing campaign based on a detected opportunity.

OPPORTUNITY TYPE: ${opportunity.name}
DETECTED BECAUSE: ${opportunity.detectedBecause}
CONFIDENCE: ${opportunity.confidenceScore}%
CONSERVATIVE IMPACT: ₹${Math.round(opportunity.impactTiers.conservative).toLocaleString()}
EXPECTED IMPACT: ₹${Math.round(opportunity.impactTiers.expected).toLocaleString()}
OPTIMISTIC IMPACT: ₹${Math.round(opportunity.impactTiers.optimistic).toLocaleString()}
OBJECTIVE: ${objective}

EVIDENCE (Real data from ERP):
${evidenceBullets}

SAMPLE CUSTOMERS/PRODUCTS AFFECTED:
${cohortDescription}

Your task: Generate a comprehensive "Business Consultant" report AND a marketing message.
Do not invent numbers. Base your analysis entirely on the evidence provided above.

Return ONLY valid JSON in this exact structure:
{
  "campaignName": "Catchy, clear campaign name",
  "opportunitySummary": "1-2 sentences summarizing the opportunity and why it was detected",
  "whyThisMatters": "2-3 sentences explaining the business problem, urgency, and revenue potential",
  "recommendedStrategy": [
    "Step 1: Be specific (e.g., call top 3 customers)",
    "Step 2",
    "Step 3"
  ],
  "whyThisWorks": "2-3 sentences explaining the behavioral/business logic of the strategy",
  "expectedImpact": {
    "conservative": "₹${Math.round(opportunity.impactTiers.conservative).toLocaleString()}",
    "expected": "₹${Math.round(opportunity.impactTiers.expected).toLocaleString()}",
    "optimistic": "₹${Math.round(opportunity.impactTiers.optimistic).toLocaleString()}"
  },
  "successMetrics": [
    "Metric 1", "Metric 2"
  ],
  "risks": [
    "Risk 1 with brief mitigation",
    "Risk 2"
  ],
  "generatedMessage": {
    "whatsapp": "A friendly, polite WhatsApp message. Use Indian context. Keep it short.",
    "sms": "A very short SMS version (under 160 chars)"
  }
}`;
}

async function generateCampaign(opportunity, objective) {
  const client = getClient();
  const CHAT_MODEL = process.env.CHAT_MODEL || 'llama-3.3-70b-versatile';

  if (!client) {
    console.log('[MarketingAI] No API key — using mock campaign.');
    return {
      campaignName: `${opportunity.name} - ${objective}`,
      opportunitySummary: `We detected this opportunity because ${opportunity.detectedBecause}`,
      whyThisMatters: `Capturing this opportunity could yield ₹${Math.round(opportunity.expectedImpact).toLocaleString()} in revenue. Acting now prevents further decay or locked capital.`,
      recommendedStrategy: [
        "Review the target list and prioritize by value.",
        "Send personalized messages to top targets.",
        "Follow up with a phone call after 2 days."
      ],
      whyThisWorks: "Direct engagement works best for MSME businesses. Customers appreciate personal touch over automated blasts.",
      expectedImpact: {
        conservative: `₹${Math.round(opportunity.impactTiers.conservative).toLocaleString()}`,
        expected: `₹${Math.round(opportunity.impactTiers.expected).toLocaleString()}`,
        optimistic: `₹${Math.round(opportunity.impactTiers.optimistic).toLocaleString()}`
      },
      successMetrics: ["Response Rate", "Conversion Rate", "Revenue Generated"],
      risks: ["Message fatigue if contacted too often", "Lower than expected conversion"],
      generatedMessage: {
        whatsapp: "Namaste! We have a special offer just for you...",
        sms: "Special offer inside! Visit us today."
      }
    };
  }

  try {
    const prompt = buildCampaignPrompt(opportunity, objective);
    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.4,
      response_format: { type: "json_object" }
    });

    const raw = response.choices[0].message.content.trim();
    return safeParseJSON(raw, 'generateCampaign');
  } catch (err) {
    console.error('[MarketingAI] Campaign generation error:', err.message);
    throw new Error(`AI campaign generation failed: ${err.message}`);
  }
}

// Build a short marketing summary for the AI Assistant context block
function buildMarketingContextSummary(opportunities) {
  if (!opportunities || opportunities.length === 0) return '';
  const lines = opportunities.map((o, i) =>
    `${i + 1}. ${o.name} — ₹${Math.round(o.expectedImpact).toLocaleString()} opportunity (${o.priority} priority, ${o.confidenceScore}% confidence). ${o.summary}`
  );
  return `\nMARKETING OPPORTUNITIES:\n${lines.join('\n')}`;
}

module.exports = {
  generateCampaign,
  buildMarketingContextSummary,
  getClient,
  safeParseJSON
};
