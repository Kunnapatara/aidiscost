/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Finding, VerificationState, AIEvent, VerificationObservationResult } from '../../types/domain';

/**
 * Enforced verification constraints
 */
export const VERIFICATION_CONSTRAINTS = {
  MIN_POST_DEPLOYMENT_EVENTS: 15,
  MIN_BASELINE_EVENTS: 5,
  MIN_UNIT_REDUCTION_PCT: 10.0,
} as const;

/**
 * Validates whether the baseline finding provides a legitimate, production-grade
 * starting baseline for post-deployment verification.
 */
export function isValidProductionBaseline(
  finding: Finding,
  state: VerificationState
): { valid: boolean; reason?: string } {
  // Synthetic sample datasets cannot produce authoritative verification
  if (finding.is_sample_data) {
    return {
      valid: false,
      reason: 'Baseline finding was derived from synthetic sample/demo dataset. Authoritative verification requires genuine production telemetry.',
    };
  }

  // Baseline sample count must be sufficient
  const sampleCount = state.baseline_window.sample_count || finding.eligible_event_count;
  if (!sampleCount || sampleCount < VERIFICATION_CONSTRAINTS.MIN_BASELINE_EVENTS) {
    return {
      valid: false,
      reason: `Baseline sample count (${sampleCount}) is below the required minimum of ${VERIFICATION_CONSTRAINTS.MIN_BASELINE_EVENTS} events.`,
    };
  }

  // Baseline spend must be positive
  if (!finding.baseline_spend_usd || finding.baseline_spend_usd <= 0) {
    return {
      valid: false,
      reason: 'Baseline spend basis must be strictly greater than $0.00.',
    };
  }

  // Baseline unit cost must be positive
  if (!state.baseline_window.avg_cost_per_call_usd || state.baseline_window.avg_cost_per_call_usd <= 0) {
    return {
      valid: false,
      reason: 'Baseline average unit cost per execution must be strictly greater than $0.00.',
    };
  }

  // Baseline scope must be defined
  if (!finding.affected_scope || !finding.affected_scope.trim()) {
    return {
      valid: false,
      reason: 'Baseline finding has an undefined or empty affected scope.',
    };
  }

  // Baseline time window sanity
  const startTime = new Date(state.baseline_window.start).getTime();
  const endTime = new Date(state.baseline_window.end).getTime();
  if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) {
    return {
      valid: false,
      reason: 'Baseline time window contains invalid or inverted timestamps.',
    };
  }

  return { valid: true };
}

/**
 * Validates technical event data quality:
 * Rejects missing/malformed ID, missing/corrupt timestamps, invalid/negative cost,
 * non-SUCCESS status, or missing model.
 */
export function isValidEventData(e: AIEvent, deployTime: number): boolean {
  if (!e || typeof e !== 'object') return false;
  if (!e.id || typeof e.id !== 'string') return false;
  if (!e.timestamp || typeof e.timestamp !== 'string') return false;

  const eventTime = new Date(e.timestamp).getTime();
  if (isNaN(eventTime) || eventTime < deployTime) return false;

  if (typeof e.resolved_cost_usd !== 'number' || !Number.isFinite(e.resolved_cost_usd) || e.resolved_cost_usd < 0) {
    return false;
  }

  if (e.status !== 'SUCCESS') return false;
  if (!e.model || typeof e.model !== 'string' || !e.model.trim()) return false;

  return true;
}

/**
 * Determines whether a post-deployment event belongs to the comparable population
 * for the given finding (e.g. matches candidate/current model in right-sizing,
 * or matches affected model/workload context).
 */
export function isComparableEvent(event: AIEvent, finding: Finding): boolean {
  const eventModel = event.model.toLowerCase().trim();

  // Rule 1: Model Right-Sizing
  if (finding.rule_id === 'MODEL_RIGHT_SIZING') {
    // affected_scope is e.g. "gpt-4o → gpt-4o-mini"
    const scopeParts = finding.affected_scope.split(/→|->/).map(s => s.trim().toLowerCase());
    if (scopeParts.length === 2) {
      const [currentModel, candidateModel] = scopeParts;
      return eventModel === candidateModel || eventModel === currentModel;
    }
  }

  // Rule 2 & 3: Retry Loop or Repeated Call Pattern
  if (finding.affected_scope) {
    const scopeLower = finding.affected_scope.toLowerCase();
    if (scopeLower.includes(eventModel)) {
      return true;
    }
  }

  // Fallback to sample events models from finding evidence
  if (finding.evidence?.sample_events?.length) {
    const sampleModels = new Set(
      finding.evidence.sample_events
        .map(s => s.model?.toLowerCase().trim())
        .filter(Boolean)
    );
    if (sampleModels.size > 0 && sampleModels.has(eventModel)) {
      return true;
    }
  }

  // If no finding-specific model restriction was established, require chat/completion operation match
  return event.operation === 'chat' || event.operation === 'completion';
}

/**
 * Initialize baseline state from finding
 */
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
    is_simulated: finding.is_sample_data,
  };
}

/**
 * Evaluates post-deployment verification against empirical telemetry.
 * 
 * CORE TRUTH INVARIANTS:
 * 1. DEMO / SIMULATION telemetry can NEVER produce stage: 'VERIFIED_RESULT'.
 * 2. Ambiguous / unknown provenance (is_simulated === undefined) is strictly excluded
 *    from production verification sets.
 * 3. Authoritative VERIFIED_RESULT requires:
 *    - Genuine non-sample baseline
 *    - Strictly non-simulated production events (is_simulated === false)
 *    - Valid event data quality (valid timestamps >= deployTime, positive cost, SUCCESS status)
 *    - Finding scope comparability
 *    - Minimum 15 eligible post-deployment observations
 *    - Sustained unit cost reduction >= 10.0%
 */
export function evaluateVerification(
  currentState: VerificationState,
  finding: Finding,
  postDeploymentEvents: AIEvent[]
): VerificationState {
  // If not deployed yet
  if (currentState.stage === 'BASELINE') {
    return currentState;
  }

  const deployTime = currentState.deployment_timestamp
    ? new Date(currentState.deployment_timestamp).getTime()
    : Date.now() - 3600_000;

  // Classify events by strict provenance
  const simulatedEvents = postDeploymentEvents.filter(e => e.is_simulated === true);
  const productionEvents = postDeploymentEvents.filter(e => e.is_simulated === false);
  const unknownProvenanceEvents = postDeploymentEvents.filter(e => e.is_simulated === undefined);

  // -------------------------------------------------------------------------
  // PATH A: DEMO / SIMULATION Telemetry Evaluation
  // If all post events are simulated, or there are zero production events:
  // -------------------------------------------------------------------------
  if (simulatedEvents.length > 0 && productionEvents.length === 0) {
    const validSimulated = simulatedEvents.filter(e => isValidEventData(e, deployTime));

    const observationWindow = {
      start: new Date(deployTime).toISOString(),
      end: new Date().toISOString(),
      sample_event_count: validSimulated.length,
    };

    const preAvgCost = currentState.baseline_window.avg_cost_per_call_usd;
    const totalSimCost = validSimulated.reduce((s, e) => s + e.resolved_cost_usd, 0);
    const postAvgCost = validSimulated.length > 0 ? totalSimCost / validSimulated.length : 0;
    const costDelta = preAvgCost - postAvgCost;
    const reductionPct = preAvgCost > 0 ? (costDelta / preAvgCost) * 100 : 0;
    const estimatedCallVolumeAnnual = currentState.baseline_window.sample_count * 52;
    const simulatedAnnualSavings = Math.max(0, costDelta * estimatedCallVolumeAnnual);

    const isThresholdMet = validSimulated.length >= VERIFICATION_CONSTRAINTS.MIN_POST_DEPLOYMENT_EVENTS;

    const simResult: VerificationObservationResult = {
      pre_cost_per_call_usd: Number(preAvgCost.toFixed(6)),
      post_cost_per_call_usd: Number(postAvgCost.toFixed(6)),
      observed_reduction_pct: Number(reductionPct.toFixed(1)),
      annualized_realized_savings_usd: Number(simulatedAnnualSavings.toFixed(2)),
      verification_confidence: isThresholdMet ? 'MEDIUM' : 'INSUFFICIENT_OBSERVATION',
      verification_notes: isThresholdMet
        ? `[SIMULATION PREVIEW] Simulated empirical reduction of ${reductionPct.toFixed(1)}% across ${validSimulated.length} synthetic events. Non-authoritative preview for demonstration; cannot produce commercial billing verification.`
        : `[SIMULATION PREVIEW] Insufficient sample: observed ${validSimulated.length} of ${VERIFICATION_CONSTRAINTS.MIN_POST_DEPLOYMENT_EVENTS} required post-deployment events.`,
      is_authoritative: false,
    };

    // STRICT TRUTH BOUNDARY:
    // stage REMAINS 'OBSERVATION_ACTIVE'. It is NEVER 'VERIFIED_RESULT'.
    // Authoritative verified savings is strictly 0.
    return {
      ...currentState,
      stage: 'OBSERVATION_ACTIVE',
      is_simulated: true,
      observation_window: observationWindow,
      simulated_result: simResult,
      observed_result: {
        pre_cost_per_call_usd: Number(preAvgCost.toFixed(6)),
        post_cost_per_call_usd: Number(postAvgCost.toFixed(6)),
        observed_reduction_pct: 0,
        annualized_realized_savings_usd: 0, // No authoritative savings from simulation!
        verification_confidence: 'INSUFFICIENT_OBSERVATION',
        verification_notes: '[SIMULATION ONLY] Synthetic telemetry cannot produce authoritative commercial verification.',
        is_authoritative: false,
      },
    };
  }

  // -------------------------------------------------------------------------
  // PATH B: Authoritative Production Telemetry Evaluation
  // (Simulated and unknown provenance events are strictly excluded)
  // -------------------------------------------------------------------------
  const baselineCheck = isValidProductionBaseline(finding, currentState);
  if (!baselineCheck.valid) {
    return {
      ...currentState,
      stage: 'OBSERVATION_ACTIVE',
      is_simulated: false,
      observation_window: {
        start: new Date(deployTime).toISOString(),
        end: new Date().toISOString(),
        sample_event_count: 0,
      },
      observed_result: {
        pre_cost_per_call_usd: currentState.baseline_window.avg_cost_per_call_usd,
        post_cost_per_call_usd: 0,
        observed_reduction_pct: 0,
        annualized_realized_savings_usd: 0,
        verification_confidence: 'INSUFFICIENT_OBSERVATION',
        verification_notes: `Production verification rejected: ${baselineCheck.reason}`,
        is_authoritative: false,
      },
    };
  }

  // Filter production events: must be valid data and comparable to finding scope
  const eligiblePostEvents = productionEvents.filter(
    e => isValidEventData(e, deployTime) && isComparableEvent(e, finding)
  );

  const excludedCount = postDeploymentEvents.length - eligiblePostEvents.length;
  const exclusionNote = excludedCount > 0
    ? ` (${excludedCount} events excluded: ${simulatedEvents.length} simulated, ${unknownProvenanceEvents.length} unknown provenance, ${productionEvents.length - eligiblePostEvents.length} non-comparable/invalid).`
    : '';

  const observationWindow = {
    start: new Date(deployTime).toISOString(),
    end: new Date().toISOString(),
    sample_event_count: eligiblePostEvents.length,
  };

  // Check minimum post-deployment observation threshold (>= 15 events)
  if (eligiblePostEvents.length < VERIFICATION_CONSTRAINTS.MIN_POST_DEPLOYMENT_EVENTS) {
    const totalPostCost = eligiblePostEvents.reduce((s, e) => s + e.resolved_cost_usd, 0);
    const postAvgCost = eligiblePostEvents.length > 0 ? totalPostCost / eligiblePostEvents.length : 0;

    return {
      ...currentState,
      stage: 'OBSERVATION_ACTIVE',
      is_simulated: false,
      observation_window: observationWindow,
      observed_result: {
        pre_cost_per_call_usd: currentState.baseline_window.avg_cost_per_call_usd,
        post_cost_per_call_usd: Number(postAvgCost.toFixed(6)),
        observed_reduction_pct: 0,
        annualized_realized_savings_usd: 0,
        verification_confidence: 'INSUFFICIENT_OBSERVATION',
        verification_notes: `Observed ${eligiblePostEvents.length} of ${VERIFICATION_CONSTRAINTS.MIN_POST_DEPLOYMENT_EVENTS} required post-deployment events.${exclusionNote} Minimum 15 comparable events required over active window.`,
        is_authoritative: false,
      },
    };
  }

  // Compute production metrics across eligible production events
  const totalPostCost = eligiblePostEvents.reduce((s, e) => s + e.resolved_cost_usd, 0);
  const postAvgCost = totalPostCost / eligiblePostEvents.length;
  const preAvgCost = currentState.baseline_window.avg_cost_per_call_usd;

  const costDelta = preAvgCost - postAvgCost;
  const reductionPct = preAvgCost > 0 ? (costDelta / preAvgCost) * 100 : 0;

  // Realized annualized savings calculation:
  // Baseline call volume per year = baseline sample count * 52 weeks
  const estimatedCallVolumeAnnual = currentState.baseline_window.sample_count * 52;
  const realizedAnnualSavings = Math.max(0, costDelta * estimatedCallVolumeAnnual);

  const isVerified = reductionPct >= VERIFICATION_CONSTRAINTS.MIN_UNIT_REDUCTION_PCT;

  return {
    ...currentState,
    stage: isVerified ? 'VERIFIED_RESULT' : 'OBSERVATION_ACTIVE',
    is_simulated: false,
    observation_window: observationWindow,
    observed_result: {
      pre_cost_per_call_usd: Number(preAvgCost.toFixed(6)),
      post_cost_per_call_usd: Number(postAvgCost.toFixed(6)),
      observed_reduction_pct: Number(reductionPct.toFixed(1)),
      annualized_realized_savings_usd: isVerified ? Number(realizedAnnualSavings.toFixed(2)) : 0,
      verification_confidence: isVerified ? 'HIGH' : 'MEDIUM',
      verification_notes: isVerified
        ? `Confirmed sustained unit cost reduction of ${reductionPct.toFixed(1)}% across ${eligiblePostEvents.length} eligible production events.${exclusionNote}`
        : `Observed ${reductionPct.toFixed(1)}% delta across ${eligiblePostEvents.length} production events, below the required ${VERIFICATION_CONSTRAINTS.MIN_UNIT_REDUCTION_PCT}% sustained threshold.${exclusionNote} Observation remains active.`,
      is_authoritative: isVerified,
    },
  };
}

/**
 * Authoritative check: returns true iff the verification state represents a genuine,
 * non-simulated, production-verified outcome.
 */
export function isAuthoritativeVerified(state: VerificationState): boolean {
  return (
    state.stage === 'VERIFIED_RESULT' &&
    state.is_simulated !== true &&
    state.observed_result?.is_authoritative === true &&
    (state.observed_result?.annualized_realized_savings_usd || 0) > 0
  );
}

/**
 * Returns the authoritative verified annualized savings in USD.
 * Returns 0 if unverified, simulated, or invalid.
 */
export function getAuthoritativeVerifiedSavings(state: VerificationState): number {
  return isAuthoritativeVerified(state)
    ? (state.observed_result?.annualized_realized_savings_usd || 0)
    : 0;
}
