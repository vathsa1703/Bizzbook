const OpenAI = require('openai');
const { getMetricsSnapshot } = require('./metricsService');
const { getMarketingOpportunities } = require('./marketingEngine');
const { buildMarketingContextSummary } = require('./marketingAI');
const { getDb } = require('../config/db');

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'YOUR_API_KEY_HERE') return null;
  return new OpenAI({
    apiKey: key,
    baseURL: process.env.OPENAI_BASE_URL,
  });
}

async function parseOCR(text, type) {
  const client = getClient();
  if (!client) {
    throw new Error('OpenAI client not initialized. Cannot parse OCR.');
  }

  const prompt = `You are a data extraction assistant. I will provide raw OCR text from a ${type === 'sales' ? 'sales invoice' : 'supplier purchase invoice'}.
Extract the items, total amount, and GST. For stock purchases, also try to extract supplier name, invoice number, and date.
Return ONLY valid JSON matching this schema:
{
  "items": [
    { "product_name": "string", "quantity": number, "price": number }
  ],
  "total": number,
  "gst": number,
  "supplier_name": "string (optional)",
  "invoice_number": "string (optional)",
  "date": "YYYY-MM-DD (optional)"
}
If a field is missing, omit it or set it to null/0. Do not wrap the JSON in markdown code blocks, return raw JSON string.`;

  const response = await client.chat.completions.create({
    model: process.env.CHAT_MODEL || 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: text }
    ],
    temperature: 0.1
  });

  let raw = response.choices[0].message.content.trim();
  if (raw.startsWith('\`\`\`json')) raw = raw.slice(7, -3);
  if (raw.startsWith('\`\`\`')) raw = raw.slice(3, -3);
  return JSON.parse(raw);
}

function buildAIContext(metrics, companyId) {
  let marketingSummary = '';
  let activeCampaignsSummary = '';
  let segmentsSummary = '';
  const db = getDb();
  try {
    // Only load marketing context if explicitly requested by a strategic query
    // We pass this logic down to the callLLM function now.

    const activeCampaigns = db.prepare(`SELECT name, status, target_count, expected_impact, actual_revenue, roi FROM marketing_campaigns WHERE company_id = ? AND status IN ('active', 'completed') ORDER BY created_at DESC LIMIT 3`).all(companyId);
    if (activeCampaigns.length > 0) {
      activeCampaignsSummary = '\nACTIVE/COMPLETED CAMPAIGNS:\n' + activeCampaigns.map(c => `- ${c.name} (${c.status}): Targeted ${c.target_count}, Expected ₹${c.expected_impact}, Actual ₹${c.actual_revenue}, ROI: ${c.roi !== null ? Math.round(c.roi * 100) + '%' : 'N/A'}`).join('\n');
    }

    const { getAllSegmentSummaries } = require('./segmentationEngine');
    const segments = getAllSegmentSummaries(companyId);
    if (segments.length > 0) {
      segmentsSummary = '\nTOP CUSTOMER SEGMENTS:\n' + segments.slice(0, 3).map(s => `- ${s.name}: ${s.customerCount} customers, ₹${s.totalRevenue} value`).join('\n');
    }

  } catch (e) {
    // Non-fatal — marketing context is additive
  } finally {
    db.close();
  }
  return `
BUSINESS SNAPSHOT — ${metrics.generatedAt}

SALES (Last 30 days):
- Total revenue: ₹${metrics.sales.revenue30d}
- vs previous 30 days: ${metrics.sales.revenueMoM > 0 ? "+" : ""}${metrics.sales.revenueMoM}%
- Best seller: ${metrics.sales.topProduct} (${metrics.sales.topProductQty} units, ₹${metrics.sales.topProductRevenue})
- Slowest seller: ${metrics.sales.bottomProduct}

INVENTORY:
- Total SKUs: ${metrics.inventory.totalSKUs}
- Slow-moving items (0 sales, 30+ days): ${metrics.inventory.slowMovingCount} items
- Dead stock capital: ₹${metrics.inventory.deadStockValue}
- Reorder alerts: ${metrics.inventory.reorderCount} items below safe level

CUSTOMERS:
- Total customers: ${metrics.customers.total}
- Repeat purchase rate: ${metrics.customers.repeatRate}%
- At-risk customers (inactive 45+ days): ${metrics.customers.churnRiskCount}
- Outstanding credits: ₹${metrics.customers.totalCreditsOutstanding}
${segmentsSummary}
${activeCampaignsSummary}`;
}

function isStrategicQuery(message) {
  const keywords = ['increase', 'sales', 'focus', 'marketing', 'performing', 'today', 'money', 'grow', 'improve', 'revenue', 'strategy', 'campaign', 'action'];
  const lowerMsg = message.toLowerCase();
  return keywords.some(k => lowerMsg.includes(k));
}

const getSystemPrompt = (businessType) => `You are the AI Business Advisor for BIZZBOOK Voice, an ERP platform for small Indian retail shops and MSMEs.
The user is running a ${businessType} business. Tailor your terminology and advice to fit this industry.

Your role: Analyze actual business data and give specific, actionable recommendations.

Rules:
1. NEVER give generic advice. Every recommendation must cite actual numbers from the business context provided.
2. If you cannot find specific data to support a recommendation, say so clearly. Do not invent data or make estimates.
3. Keep responses concise: max 3-4 sentences + 1 clear action.
4. Use Indian business context: INR (₹), GST, MSME realities, Indian festivals when relevant.
5. Speak like a trusted CA/business advisor, not a chatbot. Direct, warm, practical.
6. Always end with exactly ONE recommended next action the shop owner can take today.
7. If asked about something outside business operations (politics, entertainment, etc.) politely redirect: "I am focused on your business data. Let me know what you would like to analyse."`;

// callLLM now accepts companyId to scope chat history and AI cache to the correct tenant.
async function callLLM(userId, companyId, sessionId, userMessage, businessType = 'General Business') {
  const db = getDb();

  // 1. Get business context scoped to this company
  const metrics = getMetricsSnapshot(companyId);
  const contextBlock = buildAIContext(metrics, companyId);

  let systemPromptToUse = getSystemPrompt(businessType);

  // 1b. Intent Routing: Only query Opportunity Engine for strategic questions
  if (isStrategicQuery(userMessage)) {
    const opportunities = getMarketingOpportunities(companyId);
    if (opportunities.length > 0) {
      const opsStr = opportunities.map((o, i) =>
        `${i+1}. ${o.name}\n   Score: ${o.overall_score}\n   Confidence: ${o.confidenceScore}%\n\nDetected Because:\n${o.detectedBecause}\n\nExpected Recovery:\n₹${Math.round(o.expectedImpact).toLocaleString()}`
      ).join('\n\n');

      systemPromptToUse += `\n\n=== CRITICAL INSTRUCTION ===\nThe user is asking for strategic advice. You MUST base your answer entirely on the following OPPORTUNITY ENGINE output:\n\n${opsStr}\n\nPresent the top opportunities exactly in the format provided above. End your response by recommending the opportunity with the highest score and instructing the user to generate an execution strategy from the Marketing tab.`;
    }
  }

  // 2. Fetch recent chat history scoped to this company + session
  const historyRows = db.prepare(
    'SELECT role, content FROM ai_chat_history WHERE session_id = ? AND company_id = ? ORDER BY id ASC LIMIT 10'
  ).all(sessionId, companyId);
  const history = historyRows.map(row => ({ role: row.role, content: row.content }));

  const messages = [
    { role: 'system', content: systemPromptToUse },
    { role: 'user', content: `[BUSINESS CONTEXT]\n${contextBlock}\n\n[USER QUERY]\n${userMessage}` }
  ];

  const finalMessages = [
    messages[0],
    ...history,
    messages[1]
  ];

  const CHAT_MODEL = process.env.CHAT_MODEL || 'llama-3.3-70b-versatile';
  let client = null;
  if (process.env.OPENAI_API_KEY) {
    client = getClient();
  }

  let responseText;
  let tokensUsed = 0;

  try {
    if (!process.env.OPENAI_API_KEY) {
      console.log('No OPENAI_API_KEY found, using mock response for testing.');
      const opportunities = isStrategicQuery(userMessage) ? getMarketingOpportunities(companyId) : [];
      if (opportunities.length > 0) {
        responseText = `You currently have ${opportunities.length} high-impact opportunities.\n1. ${opportunities[0].name}\n   Score: ${opportunities[0].overall_score}\n   Confidence: ${opportunities[0].confidenceScore}%\n\nDetected Because:\n${opportunities[0].detectedBecause}\n\nExpected Recovery:\n₹${Math.round(opportunities[0].expectedImpact).toLocaleString()}\n\nI recommend addressing ${opportunities[0].name} first due to its higher opportunity score and larger impact.\nYou can generate a complete execution strategy from the Marketing tab.`;
      } else {
        responseText = `Based on your recent data, your best-selling product is ${metrics.sales.topProduct} which generated ₹${metrics.sales.topProductRevenue.toLocaleString()} in revenue this month. I recommend checking its stock levels to prevent stockouts!`;
      }
      tokensUsed = 150;
    } else {
      const response = await client.chat.completions.create({
        model: CHAT_MODEL,
        messages: finalMessages,
        max_tokens: 600,
        temperature: 0.3
      });

      responseText = response.choices[0].message.content;
      tokensUsed = response.usage?.total_tokens || 0;
    }
  } catch (err) {
    console.error('LLM API Error:', err);
    throw new Error('Failed to reach AI service.');
  }

  // 3. Save chat history scoped to company
  const insertStmt = db.prepare(
    'INSERT INTO ai_chat_history (user_id, company_id, session_id, role, content, tokens_used) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertStmt.run(userId, companyId, sessionId, 'user', userMessage, 0);
  insertStmt.run(userId, companyId, sessionId, 'assistant', responseText, tokensUsed);

  db.close();

  return {
    reply: responseText,
    confidence: 1.0,
    tokensUsed: tokensUsed
  };
}

// Generic single-shot chat completion for any AI caller that needs the same
// client construction (OPENAI_API_KEY / OPENAI_BASE_URL / CHAT_MODEL) as the
// primary Chat AI, without going through callLLM()'s business-snapshot context
// building and chat-history persistence (e.g. the Growth Advisor, which has its
// own system prompt and its own session-history table). Throws on failure so
// callers can apply their own domain-appropriate fallback copy.
async function chatCompletion(messages, { maxTokens = 800, temperature = 0.7 } = {}) {
  const client = getClient();
  if (!client) {
    throw new Error('OpenAI client not initialized (missing API key)');
  }
  const CHAT_MODEL = process.env.CHAT_MODEL || 'llama-3.3-70b-versatile';
  try {
    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    });
    return response.choices[0]?.message?.content || '';
  } catch (err) {
    console.error('LLM API Error:', err);
    throw new Error('Failed to reach AI service.');
  }
}

async function transcribeAudio(filePath) {
  const fs = require('fs');
  const client = getClient();
  
  if (!client) {
    throw new Error('OpenAI client not initialized (missing API key)');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const transcription = await client.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: process.env.WHISPER_MODEL || 'whisper-large-v3',
  });

  return transcription.text;
}

module.exports = {
  callLLM,
  buildAIContext,
  transcribeAudio,
  parseOCR,
  chatCompletion
};
