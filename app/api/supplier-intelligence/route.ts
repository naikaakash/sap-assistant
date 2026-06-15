import { NextRequest, NextResponse } from 'next/server';
import {
  getSupplierIntelligenceContext,
  SupplierIntelligence,
  trackTokenUsage
} from '@/src/services/data/csvDataService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const supplierId = searchParams.get('supplier_id');

    if (!supplierId) {
      return NextResponse.json({ error: 'Missing supplier_id parameter.' }, { status: 400 });
    }

    const ctx = await getSupplierIntelligenceContext(supplierId);
    if (!ctx) {
      return NextResponse.json({ error: `Supplier ${supplierId} not found.` }, { status: 404 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const azureKey = process.env.AZURE_OPENAI_KEY;

    const prompt = `You are a strategic procurement intelligence analyst. Analyse the following supplier data profile and return a structured assessment as strictly valid JSON.

SUPPLIER PROFILE:
- Name: ${ctx.supplier_name} (${ctx.supplier_id})
- Country/Region: ${ctx.country}
- Sourcing Tier: ${ctx.supplier_tier}
- On-Time Delivery (OTD): ${ctx.on_time_delivery_pct}%
- Quality (PPM defect rate): ${ctx.quality_ppm} PPM
- Risk Score: ${ctx.risk_score}/100
- Avg Response Time: ${ctx.avg_response_days} days
- Blocked Flag: ${ctx.blocked_flag === 'Y' ? 'YES — sourcing blocked' : 'No'}
- Open Committed Spend: $${ctx.open_spend.toLocaleString()}
- Active Purchase Orders: ${ctx.active_po_count}
- Active Exceptions (unresolved): ${ctx.active_exception_count} (Critical: ${ctx.critical_exception_count})
- Payment Terms: ${ctx.payment_terms}
- Incoterms: ${ctx.incoterms}

Return ONLY this JSON structure (no markdown, no extra text):
{
  "supplier_id": "${ctx.supplier_id}",
  "relationship_health": "<one of: Strong, Stable, At Risk, Critical>",
  "summary": "<2-3 sentence strategic assessment of this supplier's reliability, risk exposure, and current standing>",
  "watch_items": ["<specific watch point 1>", "<specific watch point 2>"],
  "recommended_action": "<single most impactful action the procurement team should take now>"
}`;

    let result: SupplierIntelligence | null = null;
    let tokensUsed = 0;
    let modelType: 'gemini' | 'azure' | 'none' = 'none';

    if (geminiKey) {
      modelType = 'gemini';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 400,
              responseMimeType: 'application/json'
            }
          })
        }
      );
      if (!response.ok) throw new Error(`Gemini error ${response.status}`);
      const json = await response.json();
      tokensUsed = json.usageMetadata?.totalTokenCount || 0;
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      result = JSON.parse(cleaned);

    } else if (azureKey) {
      modelType = 'azure';
      const resource = process.env.AZURE_OPENAI_RESOURCE;
      const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
      const response = await fetch(
        `https://${resource}.openai.azure.com/openai/deployments/${deployment}/chat/completions?api-version=2024-10-21`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': azureKey },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: 'You are a procurement analyst. Return only valid JSON, no markdown.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
            max_tokens: 400,
            response_format: { type: 'json_object' }
          })
        }
      );
      if (!response.ok) throw new Error(`Azure error ${response.status}: ${await response.text()}`);
      const json = await response.json();
      tokensUsed = json.usage?.total_tokens || 0;
      const rawText = json.choices?.[0]?.message?.content || '{}';
      const stripped = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      const cleaned = stripped.startsWith('{') ? stripped : (stripped.match(/\{[\s\S]*\}/)?.[0] || stripped);
      result = JSON.parse(cleaned);

    } else {
      // Rule-based fallback — deterministic
      modelType = 'none';
      const otd = ctx.on_time_delivery_pct;
      const risk = ctx.risk_score;
      const health: SupplierIntelligence['relationship_health'] =
        ctx.blocked_flag === 'Y' || risk >= 70 ? 'Critical'
        : risk >= 50 || otd < 70 ? 'At Risk'
        : otd >= 90 && risk < 30 ? 'Strong'
        : 'Stable';

      const watchItems: string[] = [];
      if (otd < 75) watchItems.push(`On-time delivery is ${otd}% — below acceptable threshold of 75%.`);
      if (ctx.critical_exception_count > 0) watchItems.push(`${ctx.critical_exception_count} critical unresolved exception(s) currently active.`);
      if (ctx.avg_response_days > 5) watchItems.push(`Average response time of ${ctx.avg_response_days} days exceeds SLA.`);
      if (ctx.quality_ppm > 800) watchItems.push(`Quality PPM of ${ctx.quality_ppm} indicates elevated defect risk.`);
      if (watchItems.length === 0) watchItems.push('All key performance indicators are within acceptable parameters.');

      result = {
        supplier_id: supplierId,
        relationship_health: health,
        summary: `${ctx.supplier_name} is a ${ctx.supplier_tier} tier supplier from ${ctx.country} with an OTD of ${otd}% and a risk score of ${risk}/100. ${ctx.active_exception_count > 0 ? `There are currently ${ctx.active_exception_count} unresolved exceptions.` : 'No active exceptions are on file.'} Open committed spend is $${ctx.open_spend.toLocaleString()}. (AI API key not configured — showing rule-based assessment.)`,
        watch_items: watchItems.slice(0, 2),
        recommended_action: health === 'Critical'
          ? 'Schedule urgent supplier review meeting and consider alternative sourcing options.'
          : health === 'At Risk'
          ? 'Issue formal performance improvement notice and monitor weekly.'
          : 'Continue regular performance monitoring and engage for quarterly business review.'
      };
    }

    if (tokensUsed > 0) trackTokenUsage(tokensUsed, modelType);
    return NextResponse.json(result);

  } catch (err: any) {
    console.error('Supplier Intelligence API error:', err);
    return NextResponse.json({ error: 'Supplier intelligence failed: ' + err.message }, { status: 500 });
  }
}
