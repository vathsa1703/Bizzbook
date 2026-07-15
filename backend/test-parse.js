const rawModelResponse = "```json\n{\n  \"campaignName\": \"Test Campaign\",\n  \"goal\": \"Increase sales\"\n}\n```";
console.log('--- RAW MODEL RESPONSE ---');
console.log(rawModelResponse);

function safeParseJSON(raw, context) {
  try {
    let clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    throw new Error('Parse failed');
  }
}

const parsed = safeParseJSON(rawModelResponse, 'test');
console.log('\n--- PARSED JSON ---');
console.log(JSON.stringify(parsed, null, 2));

console.log('\n--- FINAL FRONTEND OUTPUT ---');
console.log('Campaign:', parsed.campaignName);
console.log('Goal:', parsed.goal);
