/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIEvent, Finding } from '../../types/domain';
import { calculateEventCost, lookupModelPricing } from '../pricing/registry';
import { annualizeSavings, TimeRange } from './annualization';

interface ModelCandidatePair {
  currentModel: string;
  candidateModel: string;
  maxAvgInputTokens: number;
  maxAvgOutputTokens: number;
  reason: string;
}

const RIGHT_SIZING_CANDIDATES: ModelCandidatePair[] = [
  {
    currentModel: 'gpt-4o',
    candidateModel: 'gpt-4o-mini',
    maxAvgInputTokens: 400,
    maxAvgOutputTokens: 100,
    reason: 'Workload exhibits short input and brief deterministic output suitable for gpt-4o-mini evaluation.',
  },
  {
    currentModel: 'gpt-4-turbo',
    candidateModel: 'gpt-4o-mini',
    maxAvgInputTokens: 500,
    maxAvgOutputTokens: 150,
    reason: 'Legacy GPT-4 Turbo tier used for basic inference eligible for modern distilled model evaluation at 94% lower catalog rate.',
  },
  {
    currentModel: 'claude-3-5-sonnet',
    candidateModel: 'claude-3-5-haiku',
    maxAvgInputTokens: 450,
    maxAvgOutputTokens: 120,
    reason: 'Short prompt classification or extraction task eligible for evaluation on Claude 3.5 Haiku at 73% lower catalog rate.',
  },
  {
    currentModel: 'gemini-1.5-pro',
    candidateModel: 'gemini-1.5-flash',
    maxAvgInputTokens: 600,
    maxAvgOutputTokens: 150,
    reason: 'High-tier Gemini 1.5 Pro used for low-context requests without extensive multi-turn document retrieval.',
  },
];

export function evaluateModelRightSizing(
  events: AIEvent[],
  auditId: string,
  isSampleData: boolean,
  timeRange?: TimeRange
): Finding | null {
  // Group events by model
  const modelGroups = new Map<string, AIEvent[]>();
  for (const ev of events) {
    if (ev.status !== 'SUCCESS') continue;
    if (ev.cost_provenance === 'UNPRICED') continue;
    const m = ev.model.toLowerCase();
    const list = modelGroups.get(m) || [];
    list.push(ev);
    modelGroups.set(m, list);
  }

  for (const pair of RIGHT_SIZING_CANDIDATES) {
    // Find matching events for currentModel
    let matchedEvents: AIEvent[] = [];
    for (const [modelKey, list] of modelGroups.entries()) {
      if (modelKey.includes(pair.currentModel)) {
        matchedEvents = matchedEvents.concat(list);
      }
    }

    // Require sufficient statistical sample size
    if (matchedEvents.length < 10) {
      continue;
    }

    const avgIn = matchedEvents.reduce((s, e) => s + e.input_tokens, 0) / matchedEvents.length;
    const avgOut = matchedEvents.reduce((s, e) => s + e.output_tokens, 0) / matchedEvents.length;

    // Check if within token thresholds indicating lightweight workload
    if (avgIn > pair.maxAvgInputTokens || avgOut > pair.maxAvgOutputTokens) {
      continue;
    }

    // Calculate deterministic spend comparison
    let baselineSpend = 0;
    let candidateSpend = 0;

    for (const ev of matchedEvents) {
      baselineSpend += ev.resolved_cost_usd;
      const candidateCostResult = calculateEventCost(pair.candidateModel, ev.input_tokens, ev.output_tokens);
      if (candidateCostResult.is_priced && candidateCostResult.calculated_cost_usd !== undefined) {
        candidateSpend += candidateCostResult.calculated_cost_usd;
      }
    }

    const estimatedSavings = Math.max(0, baselineSpend - candidateSpend);
    if (estimatedSavings <= 0.001) {
      continue;
    }

    const savingsPct = Number(((estimatedSavings / baselineSpend) * 100).toFixed(1));

    // Annualized projection based strictly on observed telemetry duration
    const annualization = annualizeSavings(estimatedSavings, timeRange);
    const annualized = annualization.annualized_usd;

    const sampleTraces = Array.from(new Set(matchedEvents.map(e => e.trace_id))).slice(0, 5);

    // Derive rates directly from authoritative pricing registry
    const currentPricing = lookupModelPricing(pair.currentModel);
    const candidatePricing = lookupModelPricing(pair.candidateModel);
    const currentInRateStr = currentPricing ? `$${currentPricing.input_per_million_usd.toFixed(2)}` : 'Catalog rate unpriced';
    const candidateInRateStr = candidatePricing ? `$${candidatePricing.input_per_million_usd.toFixed(2)}` : 'Catalog rate unpriced';
    const currentOutRateStr = currentPricing ? `$${currentPricing.output_per_million_usd.toFixed(2)}` : 'Catalog rate unpriced';
    const candidateOutRateStr = candidatePricing ? `$${candidatePricing.output_per_million_usd.toFixed(2)}` : 'Catalog rate unpriced';

    const assumptions = [
      `Evaluation opportunity: candidate model ${pair.candidateModel} must be evaluated against task benchmarks to confirm acceptable output quality before migration.`,
      'Token counts remain consistent with observed production distribution.',
      'Requires canary benchmark test plan and task output evaluation prior to production migration.',
    ];
    if (annualization.conservative_assumption) {
      assumptions.push(annualization.conservative_assumption);
    }

    return {
      id: `fnd_right_sizing_${pair.currentModel}_${pair.candidateModel}`,
      audit_id: auditId,
      rule_id: 'MODEL_RIGHT_SIZING',
      title: 'Potential Model Right-Sizing Opportunity',
      summary: `Detected ${matchedEvents.length} lightweight calls on ${pair.currentModel} (avg ${Math.round(avgIn)} in / ${Math.round(avgOut)} out tokens) eligible for ${pair.candidateModel} evaluation.`,
      affected_scope: `${pair.currentModel} → ${pair.candidateModel}`,
      detection_confidence: 'HIGH',
      cost_confidence: 'HIGH',
      savings_confidence: 'ESTIMATED',
      baseline_spend_usd: Number(baselineSpend.toFixed(4)),
      candidate_spend_usd: Number(candidateSpend.toFixed(4)),
      estimated_savings_usd: Number(estimatedSavings.toFixed(4)),
      potential_savings_pct: savingsPct,
      annualized_projection_usd: annualized,
      eligible_event_count: matchedEvents.length,
      calculation_method: `Deterministic pricing delta: ${pair.currentModel} catalog rate vs ${pair.candidateModel} rate applied to observed token distribution. ${annualization.methodology_description}`,
      assumptions,
      evidence: {
        affected_event_count: matchedEvents.length,
        sample_events: matchedEvents.slice(0, 4).map(e => ({
          id: e.id,
          model: e.model,
          input_tokens: e.input_tokens,
          output_tokens: e.output_tokens,
          resolved_cost_usd: e.resolved_cost_usd,
          cost_provenance: e.cost_provenance,
          prompt_hash: e.prompt_hash,
          trace_id: e.trace_id,
        })),
        metrics_comparison: [
          {
            label: 'Current Model',
            current_value: pair.currentModel,
            target_value: pair.candidateModel,
            provenance: 'SOURCE_REPORTED',
          },
          {
            label: 'Input Rate ($ / 1M tokens)',
            current_value: currentInRateStr,
            target_value: candidateInRateStr,
            provenance: 'CALCULATED',
          },
          {
            label: 'Output Rate ($ / 1M tokens)',
            current_value: currentOutRateStr,
            target_value: candidateOutRateStr,
            provenance: 'CALCULATED',
          },
          {
            label: 'Observed Spend vs Opportunity',
            current_value: `$${baselineSpend.toFixed(4)}`,
            target_value: `$${candidateSpend.toFixed(4)}`,
            provenance: 'ESTIMATED',
          },
        ],
        trace_samples: sampleTraces,
        mathematical_proof: `Formula: Sum[ (Input_i * Rate_curr_in + Output_i * Rate_curr_out) - (Input_i * Rate_cand_in + Output_i * Rate_cand_out) ] using registry rates (${pair.currentModel} in: ${currentInRateStr}, out: ${currentOutRateStr} vs ${pair.candidateModel} in: ${candidateInRateStr}, out: ${candidateOutRateStr}) across ${matchedEvents.length} events = $${estimatedSavings.toFixed(4)} estimated reduction (${savingsPct}%).`,
      },
      status: 'DETECTED',
      is_sample_data: isSampleData,
    };
  }

  return null;
}
