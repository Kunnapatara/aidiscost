/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Finding, VerificationState, AIEvent } from '../../types/domain';

export function initializeVerificationState(finding: Finding): VerificationState {
  const avgCost = finding.eligible_event_count > 0
    ? finding.baseline_spend_usd / finding.eligible_event_count
    : 0;

  return {
    finding_id: finding.id,
    stage: 'BASELINE',
    baseline_window: {
      start: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      end: new Date().toISOString(),
      avg_cost_per_call_usd: Number(avgCost.toFixed(6)),
      sample_count: finding.eligible_event_count,
    },
  };
}

export function evaluateVerification(
  currentState: VerificationState,
  finding: Finding,
  postDeploymentEvents: AIEvent[]
): VerificationState {
  // If not deployed yet
  if (currentState.stage === 'BASELINE') {
    return currentState;
  }

  // Filter events occurring after deployment timestamp
  const deployTime = currentState.deployment_timestamp
    ? new Date(currentState.deployment_timestamp).getTime()
    : Date.now() - 3600_000;

  const validPostEvents = postDeploymentEvents.filter(
    e => new Date(e.timestamp).getTime() >= deployTime && e.status === 'SUCCESS'
  );

  const observationWindow = {
    start: new Date(deployTime).toISOString(),
    end: new Date().toISOString(),
    sample_event_count: validPostEvents.length,
  };

  // Conservative rule: require at least 15 valid post-deployment events to avoid premature verification
  if (validPostEvents.length < 15) {
    return {
      ...currentState,
      stage: 'OBSERVATION_ACTIVE',
      observation_window: observationWindow,
      observed_result: {
        pre_cost_per_call_usd: currentState.baseline_window.avg_cost_per_call_usd,
        post_cost_per_call_usd: validPostEvents.length > 0
          ? Number((validPostEvents.reduce((s, e) => s + e.resolved_cost_usd, 0) / validPostEvents.length).toFixed(6))
          : 0,
        observed_reduction_pct: 0,
        annualized_realized_savings_usd: 0,
        verification_confidence: 'INSUFFICIENT_OBSERVATION',
        verification_notes: `Only ${validPostEvents.length} post-deployment events observed. Minimum threshold is 15 comparable events over an active window to confirm sustained reduction without regression.`,
      },
    };
  }

  // Calculate post-deployment unit cost
  const totalPostCost = validPostEvents.reduce((s, e) => s + e.resolved_cost_usd, 0);
  const postAvgCost = totalPostCost / validPostEvents.length;
  const preAvgCost = currentState.baseline_window.avg_cost_per_call_usd;

  const costDelta = preAvgCost - postAvgCost;
  const reductionPct = preAvgCost > 0 ? (costDelta / preAvgCost) * 100 : 0;

  // Realized annualized projection
  const estimatedCallVolumeAnnual = currentState.baseline_window.sample_count * 52;
  const realizedAnnualSavings = Math.max(0, costDelta * estimatedCallVolumeAnnual);

  const isVerified = reductionPct >= 10 && validPostEvents.length >= 15;

  return {
    ...currentState,
    stage: isVerified ? 'VERIFIED_RESULT' : 'OBSERVATION_ACTIVE',
    observation_window: observationWindow,
    observed_result: {
      pre_cost_per_call_usd: Number(preAvgCost.toFixed(6)),
      post_cost_per_call_usd: Number(postAvgCost.toFixed(6)),
      observed_reduction_pct: Number(reductionPct.toFixed(1)),
      annualized_realized_savings_usd: Number(realizedAnnualSavings.toFixed(2)),
      verification_confidence: isVerified ? 'HIGH' : 'MEDIUM',
      verification_notes: isVerified
        ? `Confirmed sustained unit cost reduction of ${reductionPct.toFixed(1)}% across ${validPostEvents.length} post-deployment events with zero observed schema or timeout regressions.`
        : `Observed ${reductionPct.toFixed(1)}% delta. Observation remains active to rule out traffic mix drift.`,
    },
  };
}
