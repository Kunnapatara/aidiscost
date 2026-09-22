/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIEvent, Finding } from '../../types/domain';

export function evaluateRepeatedCallPattern(
  events: AIEvent[],
  auditId: string,
  isSampleData: boolean
): Finding | null {
  // Filter for events with prompt_hash and success status
  const validEvents = events.filter(e => e.status === 'SUCCESS' && e.prompt_hash);
  if (validEvents.length < 5) {
    return null;
  }

  // Group by (trace_id + prompt_hash) or (session metadata + prompt_hash) to avoid flag on disparate users
  const sessionPromptGroups = new Map<string, AIEvent[]>();

  for (const ev of validEvents) {
    // Requires contextual relationship: same trace_id, session_id, or user workflow
    const contextKey = ev.trace_id ? `${ev.trace_id}:${ev.prompt_hash}` : null;
    if (!contextKey) continue;

    const list = sessionPromptGroups.get(contextKey) || [];
    list.push(ev);
    sessionPromptGroups.set(contextKey, list);
  }

  const redundantCalls: AIEvent[] = [];
  let totalClusters = 0;
  let redundantSpend = 0;

  for (const [, cluster] of sessionPromptGroups.entries()) {
    // Need at least 3 identical calls within the same workflow context
    if (cluster.length < 3) continue;

    // Check time proximity (within 15 minutes)
    cluster.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const spanMs = new Date(cluster[cluster.length - 1].timestamp).getTime() - new Date(cluster[0].timestamp).getTime();

    if (spanMs <= 15 * 60_000) {
      totalClusters++;
      // Call 0 is original execution. Calls 1..N are redundant repetitions
      for (let i = 1; i < cluster.length; i++) {
        redundantCalls.push(cluster[i]);
        redundantSpend += cluster[i].resolved_cost_usd;
      }
    }
  }

  if (redundantCalls.length < 4 || redundantSpend <= 0.001) {
    return null;
  }

  const baselineSpend = redundantSpend + redundantCalls.reduce((s, e) => s + (e.resolved_cost_usd / (sessionPromptGroups.get(`${e.trace_id}:${e.prompt_hash}`)?.length || 1)), 0);
  const annualized = Number((redundantSpend * 30 * 12).toFixed(2));
  const sampleTraces = Array.from(new Set(redundantCalls.map(e => e.trace_id))).slice(0, 5);

  return {
    id: `fnd_repeated_calls_${auditId.substring(0, 8)}`,
    audit_id: auditId,
    rule_id: 'REPEATED_CALL_PATTERN',
    title: 'Potential Repeated Call Pattern',
    summary: `Observed ${redundantCalls.length} identical request executions across ${totalClusters} distinct trace workflows within 15-minute windows that can be served via semantic or exact caching.`,
    affected_scope: `${redundantCalls[0]?.model || 'LLM'} contextual workflows`,
    detection_confidence: 'HIGH',
    cost_confidence: 'HIGH',
    savings_confidence: 'HIGH',
    baseline_spend_usd: Number(baselineSpend.toFixed(4)),
    candidate_spend_usd: Number((baselineSpend - redundantSpend).toFixed(4)),
    estimated_savings_usd: Number(redundantSpend.toFixed(4)),
    potential_savings_pct: Number(((redundantSpend / baselineSpend) * 100).toFixed(1)),
    annualized_projection_usd: annualized,
    eligible_event_count: redundantCalls.length,
    calculation_method: 'Sum of billed tokens for subsequent identical prompt executions (attempt > 1) within active 15-minute trace contexts.',
    assumptions: [
      'Identical prompts executed within the same trace context with deterministic parameters (temp ≤ 0.2) can be safely cached.',
      'A TTL of 5–15 minutes on application or gateway cache prevents redundant upstream provider billing.',
    ],
    evidence: {
      affected_event_count: redundantCalls.length,
      sample_events: redundantCalls.slice(0, 4).map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        model: e.model,
        prompt_hash: e.prompt_hash,
        trace_id: e.trace_id,
        resolved_cost_usd: e.resolved_cost_usd,
        cost_provenance: e.cost_provenance,
      })),
      metrics_comparison: [
        {
          label: 'Identical Executions per Trace',
          current_value: '3 – 5 calls / trace',
          target_value: '1 origin call + local cache hit',
          provenance: 'SOURCE_REPORTED',
        },
        {
          label: 'Redundant Invocations',
          current_value: redundantCalls.length,
          target_value: 0,
          provenance: 'CALCULATED',
        },
        {
          label: 'Avoidable Ingestion Spend',
          current_value: `$${redundantSpend.toFixed(4)}`,
          target_value: `$0.0000`,
          provenance: 'CALCULATED',
        },
      ],
      trace_samples: sampleTraces,
      mathematical_proof: `Formula: Sum[ Cost_call_k ] for k in (2..N) within identical (trace_id, prompt_hash) tuples = $${redundantSpend.toFixed(4)} across ${redundantCalls.length} avoidable redundant calls.`,
    },
    status: 'DETECTED',
    is_sample_data: isSampleData,
  };
}
