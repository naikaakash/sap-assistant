import { NextRequest, NextResponse } from 'next/server';
import {
  getRootCauseContext,
  RootCauseAnalysis,
  trackTokenUsage
} from '@/src/services/data/csvDataService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const exceptionId = searchParams.get('exception_id');

    if (!exceptionId) {
      return NextResponse.json({ error: 'Missing exception_id parameter.' }, { status: 400 });
    }

    // 1. Gather full contextual signals from the data layer
    const ctx = await getRootCauseContext(exceptionId);

    if (!ctx) {
      return NextResponse.json({ error: `Exception ${exceptionId} not found in the worklist.` }, { status: 404 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const azureKey = process.env.AZURE_OPENAI_KEY;

    // 2. Build a concise, structured diagnostic prompt
    const diagnosticPrompt = `You are an expert Supply Chain Risk Analyst AI. Your task is to analyse the following exception data and return a structured root cause analysis as strictly valid JSON.

EXCEPTION DATA:
- Exception ID: ${ctx.exception_id}
- PO Number: ${ctx.po_number} / Item: ${ctx.item_number}
- Supplier: ${ctx.supplier_name} (ID: ${ctx.supplier_id})
- Days Overdue: ${ctx.days_overdue} days
- Severity: ${ctx.severity}
- Delay Category (System Diagnosed): ${ctx.delay_category}
- ASN Status: ${ctx.asn_status}
- Acknowledgement Status: ${ctx.acknowledgement_status}
- Committed Delivery Date: ${ctx.committed_delivery_date}
- Buyer Follow-up Count: ${ctx.buyer_followup_count}
- Supplier On-Time Delivery Rate: ${ctx.on_time_delivery_pct}%
- Supplier Risk Score: ${ctx.risk_score}/100
- Supplier Avg Response Days: ${ctx.avg_response_days}
- Open Financial Value at Risk: $${ctx.open_value.toFixed(2)}
- Lead Time (Planned): ${ctx.lead_time_days} days
- Safety Stock Level: ${ctx.safety_stock} pcs
- Total Communications Logged: ${ctx.communication_count} (Negative Signals: ${ctx.negative_sentiment_count})
- Latest Communication: "${ctx.latest_communication_body}"
- ASN Shipments on file: ${ctx.asn_count}
- Similar past exceptions for this supplier: ${ctx.similar_past_exceptions}
- Root Cause Note: "${ctx.root_cause_note}"

INSTRUCTIONS:
Based strictly on the data above, produce a JSON object with EXACTLY this structure (no extra text, no markdown wrapping):
{
  "exception_id": "<the exception ID>",
  "primary_cause": "<Single concise sentence — the top root cause>",
  "contributing_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "narrative": "<2-3 sentence analytical explanation of why this delay occurred, referencing the data>",
  "confidence": <integer 0-100 reflecting certainty of your diagnosis>,
  "recommended_action": "<Single specific, actionable recommendation for the buyer>"
}`;

    let analysisResult: RootCauseAnalysis | null = null;
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
            contents: [{ role: 'user', parts: [{ text: diagnosticPrompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 512,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errText}`);
      }

      const resJson = await response.json();
      tokensUsed = resJson.usageMetadata?.totalTokenCount || 0;
      const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

      try {
        // Strip potential markdown code fences if model ignores responseMimeType
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        analysisResult = {
          exception_id: parsed.exception_id || exceptionId,
          primary_cause: parsed.primary_cause || 'Unknown cause',
          contributing_factors: Array.isArray(parsed.contributing_factors) ? parsed.contributing_factors : [],
          narrative: parsed.narrative || '',
          confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : 70,
          recommended_action: parsed.recommended_action || 'Escalate to supplier management team.',
          similar_past_exceptions: ctx.similar_past_exceptions
        };
      } catch {
        throw new Error('Failed to parse Gemini JSON response.');
      }

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
              { role: 'system', content: 'You are a supply chain expert. Return only valid JSON — no markdown, no extra text.' },
              { role: 'user', content: diagnosticPrompt }
            ],
            temperature: 0.1,
            max_tokens: 512,
            response_format: { type: 'json_object' }
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Azure OpenAI error ${response.status}: ${errText}`);
      }

      const resJson = await response.json();
      tokensUsed = resJson.usage?.total_tokens || 0;
      const rawText = resJson.choices?.[0]?.message?.content || '{}';

      try {
        const stripped = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
        const cleaned = stripped.startsWith('{') ? stripped : (stripped.match(/\{[\s\S]*\}/)?.[0] || stripped);
        const parsed = JSON.parse(cleaned);
        analysisResult = {
          exception_id: parsed.exception_id || exceptionId,
          primary_cause: parsed.primary_cause || 'Unknown cause',
          contributing_factors: Array.isArray(parsed.contributing_factors) ? parsed.contributing_factors : [],
          narrative: parsed.narrative || '',
          confidence: typeof parsed.confidence === 'number' ? Math.min(100, Math.max(0, parsed.confidence)) : 70,
          recommended_action: parsed.recommended_action || 'Escalate to supplier management team.',
          similar_past_exceptions: ctx.similar_past_exceptions
        };
      } catch (e: any) {
        throw new Error(`Failed to parse Azure OpenAI JSON response: ${e.message}. Raw: ${rawText.slice(0, 200)}`);
      }

    } else {
      // 3. Graceful mock fallback — deterministic based on data signals
      modelType = 'none';
      const isMissingAck = ctx.acknowledgement_status === 'MISSING';
      const isLowOTD = ctx.on_time_delivery_pct < 75;
      const hasNegativeSentiment = ctx.negative_sentiment_count > 0;

      let primaryCause = 'Production scheduling delay at supplier facility.';
      const factors: string[] = [];
      if (isMissingAck) {
        primaryCause = 'Supplier has not acknowledged the purchase order — no delivery commitment exists.';
        factors.push(`Acknowledgement status is MISSING after ${ctx.buyer_followup_count} buyer follow-ups.`);
      }
      if (ctx.asn_status === 'CUSTOMS_HOLD') {
        primaryCause = 'Shipment is detained at customs — logistics clearance delay.';
        factors.push('ASN shipment is currently under Customs Hold status.');
      }
      if (ctx.asn_status === 'DELAYED') {
        factors.push('Advanced shipping notice shows carrier-confirmed transit delay.');
      }
      if (isLowOTD) {
        factors.push(`Supplier ${ctx.supplier_name} has a historically low on-time delivery rate of ${ctx.on_time_delivery_pct}%.`);
      }
      if (hasNegativeSentiment) {
        factors.push(`${ctx.negative_sentiment_count} out of ${ctx.communication_count} communications contain negative signals (delays, apologies).`);
      }
      if (ctx.similar_past_exceptions > 0) {
        factors.push(`This supplier has triggered ${ctx.similar_past_exceptions} similar past exceptions.`);
      }
      if (factors.length === 0) {
        factors.push('No clear ASN or acknowledgement recovery evidence.');
        factors.push(`PO line is ${ctx.days_overdue} days overdue with open value of $${ctx.open_value.toFixed(0)}.`);
      }

      analysisResult = {
        exception_id: exceptionId,
        primary_cause: primaryCause,
        contributing_factors: factors.slice(0, 3),
        narrative: `Exception ${exceptionId} relates to PO ${ctx.po_number} for supplier ${ctx.supplier_name}. The line is ${ctx.days_overdue} days overdue with $${ctx.open_value.toFixed(0)} at risk. ${isMissingAck ? 'The supplier has not provided any delivery commitment.' : `The delay category is identified as "${ctx.delay_category}".`} ${isLowOTD ? `This supplier's historical OTD is ${ctx.on_time_delivery_pct}%, indicating chronic delivery challenges.` : ''} (AI API key not configured — displaying rule-based diagnostic.)`,
        confidence: isMissingAck ? 80 : isLowOTD ? 72 : 60,
        recommended_action: isMissingAck
          ? 'Send urgent escalation email to supplier account manager. If no response within 24 hours, consider alternative sourcing.'
          : 'Request updated delivery commitment from supplier and track ASN shipment progress daily.',
        similar_past_exceptions: ctx.similar_past_exceptions
      };
    }

    // 4. Persist token usage (non-blocking)
    if (tokensUsed > 0) {
      trackTokenUsage(tokensUsed, modelType);
    }

    return NextResponse.json(analysisResult);

  } catch (err: any) {
    console.error('Root Cause Analysis API error:', err);
    return NextResponse.json(
      { error: 'Root cause analysis failed: ' + err.message },
      { status: 500 }
    );
  }
}
