import { NextResponse } from 'next/server';
import { getControlTowerSummary, trackTokenUsage } from '@/src/services/data/csvDataService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await getControlTowerSummary();
    const { metrics, priorityInbox, plantHealth, systemStatus } = summary;

    const topItems = priorityInbox.slice(0, 5).map((item, i) =>
      `${i + 1}. [${item.priority}] ${item.category}: ${item.description} — Plant ${item.plant}, ${item.supplierName}, $${item.financialRisk.toLocaleString()} at risk`
    ).join('\n');

    const plantSummary = plantHealth.map(p =>
      `- ${p.plant}: ${p.status} | Shortages: ${p.shortageCount}, Exceptions: ${p.exceptionCount}, Overdue POs: ${p.overdueCount}`
    ).join('\n');

    const systemSummary = systemStatus.map(s =>
      `- ${s.name}: ${s.status} — ${s.details}`
    ).join('\n');

    const geminiKey = process.env.GEMINI_API_KEY;
    const azureKey = process.env.AZURE_OPENAI_KEY;

    const prompt = `You are a senior supply chain executive advisor. Write a concise daily procurement portfolio briefing based on the real-time data below. Return ONLY valid JSON (no markdown).

SUPPLY CHAIN DATA SNAPSHOT (as of today):
- Overdue PO Lines: ${metrics.overduePoLines} (Total late value: $${metrics.overduePoValue.toLocaleString()})
- Missing Supplier Acknowledgements: ${metrics.missingAcks}
- Component Part Shortages: ${metrics.totalPartShortages}
- Active Exceptions: ${metrics.activeExceptions} (Critical/High: ${metrics.criticalExceptions})
- Resolution Rate: ${metrics.resolutionRate}%
- Total Financial Exposure: $${metrics.financialExposure.toLocaleString()}

TOP PRIORITY ITEMS:
${topItems}

PLANT HEALTH:
${plantSummary}

AGENT SYSTEM STATUS:
${systemSummary}

Return this JSON structure:
{
  "health_level": "<one of: Healthy, Moderate, Stressed, Critical>",
  "headline": "<one punchy sentence summarising today's procurement situation>",
  "narrative": "<2-3 sentence executive narrative of overall supply chain health, key trends, and concerns>",
  "top_risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "strategic_recommendation": "<single highest-priority action for the procurement leadership team today>"
}`;

    let tokensUsed = 0;
    let modelType: 'gemini' | 'azure' | 'none' = 'none';
    let briefing: any = null;

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
              temperature: 0.2,
              maxOutputTokens: 512,
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
      briefing = JSON.parse(cleaned);

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
              { role: 'system', content: 'You are an executive advisor. Return only valid JSON, no markdown.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 512,
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
      briefing = JSON.parse(cleaned);

    } else {
      // Rule-based fallback
      modelType = 'none';
      const healthLevel =
        metrics.criticalExceptions > 5 || metrics.financialExposure > 500000 ? 'Critical'
        : metrics.activeExceptions > 10 || metrics.totalPartShortages > 3 ? 'Stressed'
        : metrics.resolutionRate < 60 ? 'Moderate'
        : 'Healthy';

      briefing = {
        health_level: healthLevel,
        headline: `Supply chain operating at ${healthLevel} level — ${metrics.overduePoLines} overdue PO lines with $${(metrics.financialExposure / 1000).toFixed(0)}K exposure.`,
        narrative: `The procurement portfolio currently has ${metrics.activeExceptions} active exceptions (${metrics.criticalExceptions} critical/high severity) with a resolution rate of ${metrics.resolutionRate}%. Total financial exposure stands at $${metrics.financialExposure.toLocaleString()}. There are ${metrics.missingAcks} unacknowledged purchase orders and ${metrics.totalPartShortages} component shortages active across plants. (AI API key not configured — showing rule-based briefing.)`,
        top_risks: [
          `${metrics.overduePoLines} overdue PO lines totalling $${metrics.overduePoValue.toLocaleString()} in late value.`,
          `${metrics.missingAcks} supplier acknowledgements missing — delivery commitments unknown.`,
          `${metrics.totalPartShortages} component part shortages risking production line stoppages.`
        ],
        strategic_recommendation: metrics.criticalExceptions > 5
          ? 'Convene emergency procurement review — escalate critical exceptions to supplier account managers immediately.'
          : 'Prioritise resolving missing acknowledgements and expediting overdue critical PO lines this week.'
      };
    }

    if (tokensUsed > 0) trackTokenUsage(tokensUsed, modelType);

    return NextResponse.json({
      ...briefing,
      generated_at: new Date().toISOString(),
      data_snapshot: {
        overdueLines: metrics.overduePoLines,
        activeExceptions: metrics.activeExceptions,
        financialExposure: metrics.financialExposure,
        resolutionRate: metrics.resolutionRate
      }
    });

  } catch (err: any) {
    console.error('Executive Briefing API error:', err);
    return NextResponse.json({ error: 'Briefing generation failed: ' + err.message }, { status: 500 });
  }
}
