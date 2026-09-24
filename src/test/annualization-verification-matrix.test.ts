/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateAnnualizedVerifiedSavings,
  evaluateVerification,
  initializeVerificationState,
  isAuthoritativeVerified,
  getAuthoritativeVerifiedSavings,
  isValidEventData,
} from '../engine/verification/comparator';
import { calculateAuthoritativeOutcomeFee, calculateOutcomeFee } from '../engine/billing/outcome';
import { Finding, VerificationState, AIEvent } from '../types/domain';

function createMockProductionFinding(overrides: Partial<Finding> = {}): Finding {
  const now = Date.now();
  return {
    id: 'fnd_annualization_test',
    audit_id: 'aud_annualization_123',
    rule_id: 'MODEL_RIGHT_SIZING',
    title: 'Model Right-Sizing: gpt-4o -> gpt-4o-mini',
    summary: 'Workload eligible for smaller model.',
    affected_scope: 'gpt-4o → gpt-4o-mini',
    detection_confidence: 'HIGH',
    cost_confidence: 'HIGH',
    savings_confidence: 'HIGH',
    baseline_spend_usd: 10.0,
    candidate_spend_usd: 5.0,
    estimated_savings_usd: 5.0,
    potential_savings_pct: 50.0,
    annualized_projection_usd: 260.71,
    eligible_event_count: 1000,
    calculation_method: 'Observed / days * 365',
    assumptions: [],
    evidence: {
      affected_event_count: 1000,
      sample_events: [],
      metrics_comparison: [],
      trace_samples: [],
      mathematical_proof: 'Mathematical proof text',
      baseline_period: {
        start: new Date(now - 7 * 86_400_000).toISOString(),
        end: new Date(now).toISOString(),
      },
    },
    status: 'DETECTED',
    is_sample_data: false,
    ...overrides,
  };
}

function createTestEvents(
  count: number,
  params: {
    is_simulated?: boolean;
    cost?: number;
    model?: string;
    status?: 'SUCCESS' | 'ERROR';
    baseTimestamp?: number;
    stepMs?: number;
  } = {}
): AIEvent[] {
  const baseTime = params.baseTimestamp ?? Date.now() - 1800_000;
  const step = params.stepMs ?? 10_000;
  const events: AIEvent[] = [];

  for (let i = 0; i < count; i++) {
    events.push({
      id: `evt_m_${i}_${Math.random().toString(36).substring(2, 6)}`,
      source: 'custom_logs',
      source_event_id: `src_${i}`,
      timestamp: new Date(baseTime + (i + 1) * step).toISOString(),
      provider: 'openai',
      model: params.model ?? 'gpt-4o-mini',
      operation: 'chat',
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      latency_ms: 120,
      status: params.status ?? 'SUCCESS',
      trace_id: `tr_${i}`,
      tool_calls: [],
      source_reported_cost_usd: params.cost ?? 0.005,
      calculated_cost_usd: params.cost ?? 0.005,
      resolved_cost_usd: params.cost ?? 0.005,
      cost_provenance: 'CALCULATED',
      cost_confidence: 'HIGH',
      metadata: {},
      is_simulated: params.is_simulated,
    });
  }

  return events;
}

describe('Verified Annualization Using Post-Deployment Observed Volume (Required Tests 1 - 8)', () => {
  // Test 1 — Baseline and post volume differ
  // Baseline: 1,000 events / 7 days ($0.010/call)
  // Post: 7,000 events / 7 days ($0.005/call)
  // Unit-cost delta: $0.005
  // Expected annualized savings: ($0.005 * 7,000) / 7 * 365 = $1,825.00
  // (Proves calculation uses 7,000 post events, NOT 1,000 baseline events which would give $260.71)
  it('Test 1: Baseline and post volume differ — calculation uses post-deployment volume (7,000), not baseline (1,000)', () => {
    const start = '2026-09-01T00:00:00.000Z';
    const end = '2026-09-08T00:00:00.000Z'; // Exactly 7 days
    const costDelta = 0.005;
    const postCount = 7000;

    const directResult = calculateAnnualizedVerifiedSavings(costDelta, postCount, start, end);
    assert.strictEqual(directResult.valid, true);
    assert.strictEqual(directResult.duration_days, 7);
    assert.strictEqual(directResult.annualized_savings_usd, 1825.0);

    // End-to-end comparator check
    const finding = createMockProductionFinding({
      eligible_event_count: 1000,
      baseline_spend_usd: 10.0, // Pre cost per call: 10.0 / 1000 = $0.010
    });

    const deployTime = new Date(start).getTime();
    const deployedState: VerificationState = {
      finding_id: finding.id,
      stage: 'OBSERVATION_ACTIVE',
      baseline_window: {
        start: new Date(deployTime - 7 * 86_400_000).toISOString(),
        end: start,
        avg_cost_per_call_usd: 0.01,
        sample_count: 1000, // Baseline has only 1,000 events
      },
      deployment_timestamp: start,
      observation_window: {
        start: start,
        end: end,
        sample_event_count: 0,
      },
      is_simulated: false,
    };

    // 7,000 post-deployment production events at $0.005 each (delta = $0.005)
    const postEvents = createTestEvents(postCount, {
      cost: 0.005,
      is_simulated: false,
      baseTimestamp: deployTime,
      stepMs: 60_000, // Spread across window
    });

    const evaluated = evaluateVerification(deployedState, finding, postEvents);
    assert.strictEqual(evaluated.stage, 'VERIFIED_RESULT');
    assert.strictEqual(evaluated.is_simulated, false);
    assert.strictEqual(isAuthoritativeVerified(evaluated), true);
    assert.strictEqual(evaluated.observed_result?.annualized_realized_savings_usd, 1825.0);
  });

  // Test 2 — Post volume lower than baseline
  // Baseline: 10,000 events / 10 days ($0.010/call)
  // Post: 2,000 events / 5 days ($0.005/call)
  // Verify annualization uses: 2,000 / 5 * 365 = $730.00, not baseline (10,000 / 10 * 365 = $3,650.00)
  it('Test 2: Post volume lower than baseline — annualization uses post volume (2,000 / 5 * 365), not baseline volume', () => {
    const start = '2026-09-01T00:00:00.000Z';
    const end = '2026-09-06T00:00:00.000Z'; // Exactly 5 days
    const costDelta = 0.005;
    const postCount = 2000;

    const directResult = calculateAnnualizedVerifiedSavings(costDelta, postCount, start, end);
    assert.strictEqual(directResult.valid, true);
    assert.strictEqual(directResult.duration_days, 5);
    // (2000 * 0.005) / 5 * 365 = (10 / 5) * 365 = 730.00
    assert.strictEqual(directResult.annualized_savings_usd, 730.0);

    // End-to-end comparator check
    const finding = createMockProductionFinding({
      eligible_event_count: 10000,
      baseline_spend_usd: 100.0, // Pre cost per call: 100.0 / 10000 = $0.010
    });

    const deployTime = new Date(start).getTime();
    const deployedState: VerificationState = {
      finding_id: finding.id,
      stage: 'OBSERVATION_ACTIVE',
      baseline_window: {
        start: new Date(deployTime - 10 * 86_400_000).toISOString(),
        end: start,
        avg_cost_per_call_usd: 0.01,
        sample_count: 10000, // Baseline has 10,000 events
      },
      deployment_timestamp: start,
      observation_window: {
        start: start,
        end: end,
        sample_event_count: 0,
      },
      is_simulated: false,
    };

    const postEvents = createTestEvents(postCount, {
      cost: 0.005,
      is_simulated: false,
      baseTimestamp: deployTime,
      stepMs: 100_000,
    });

    const evaluated = evaluateVerification(deployedState, finding, postEvents);
    assert.strictEqual(evaluated.stage, 'VERIFIED_RESULT');
    assert.strictEqual(evaluated.observed_result?.annualized_realized_savings_usd, 730.0);
  });

  // Test 3 — Different observation duration (1-day, 7-day, 30-day post-deployment windows)
  it('Test 3: Different observation durations (1-day, 7-day, 30-day post windows)', () => {
    // 1-day window: 100 events, delta $0.05 -> observed savings $5.00 -> $5 / 1 * 365 = $1,825.00
    const start1 = '2026-09-01T00:00:00.000Z';
    const end1 = '2026-09-02T00:00:00.000Z';
    const res1 = calculateAnnualizedVerifiedSavings(0.05, 100, start1, end1);
    assert.strictEqual(res1.valid, true);
    assert.strictEqual(res1.duration_days, 1);
    assert.strictEqual(res1.annualized_savings_usd, 1825.0);

    // 7-day window: 700 events, delta $0.01 -> observed savings $7.00 -> $7 / 7 * 365 = $365.00
    const start7 = '2026-09-01T00:00:00.000Z';
    const end7 = '2026-09-08T00:00:00.000Z';
    const res7 = calculateAnnualizedVerifiedSavings(0.01, 700, start7, end7);
    assert.strictEqual(res7.valid, true);
    assert.strictEqual(res7.duration_days, 7);
    assert.strictEqual(res7.annualized_savings_usd, 365.0);

    // 30-day window: 3,000 events, delta $0.02 -> observed savings $60.00 -> $60 / 30 * 365 = $730.00
    const start30 = '2026-08-01T00:00:00.000Z';
    const end30 = '2026-08-31T00:00:00.000Z';
    const res30 = calculateAnnualizedVerifiedSavings(0.02, 3000, start30, end30);
    assert.strictEqual(res30.valid, true);
    assert.strictEqual(res30.duration_days, 30);
    assert.strictEqual(res30.annualized_savings_usd, 730.0);
  });

  // Test 4 — Invalid post observation interval
  it('Test 4: Invalid post observation interval withholds annualization and prevents verification', () => {
    // End before start
    const start = '2026-09-10T00:00:00.000Z';
    const end = '2026-09-05T00:00:00.000Z';
    const res = calculateAnnualizedVerifiedSavings(0.01, 100, start, end);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.annualized_savings_usd, 0);

    // End equal to start (zero duration)
    const resZero = calculateAnnualizedVerifiedSavings(0.01, 100, start, start);
    assert.strictEqual(resZero.valid, false);
    assert.strictEqual(resZero.annualized_savings_usd, 0);

    // Missing start
    const resMissing = calculateAnnualizedVerifiedSavings(0.01, 100, undefined, end);
    assert.strictEqual(resMissing.valid, false);

    // End-to-end check with inverted observation window
    const finding = createMockProductionFinding();
    const deployedState: VerificationState = {
      finding_id: finding.id,
      stage: 'OBSERVATION_ACTIVE',
      baseline_window: {
        start: '2026-08-20T00:00:00.000Z',
        end: '2026-08-27T00:00:00.000Z',
        avg_cost_per_call_usd: 0.01,
        sample_count: 1000,
      },
      deployment_timestamp: start,
      observation_window: {
        start: start,
        end: end, // Inverted!
        sample_event_count: 0,
      },
      is_simulated: false,
    };

    const postEvents = createTestEvents(25, {
      cost: 0.005,
      is_simulated: false,
      baseTimestamp: new Date(start).getTime(),
    });

    const evaluated = evaluateVerification(deployedState, finding, postEvents);
    assert.strictEqual(evaluated.stage, 'OBSERVATION_ACTIVE');
    assert.strictEqual(evaluated.observed_result?.annualized_realized_savings_usd, 0);
    assert.strictEqual(isAuthoritativeVerified(evaluated), false);
  });

  // Test 5 — Zero post event count
  it('Test 5: Zero post event count withholds annualization', () => {
    const start = '2026-09-01T00:00:00.000Z';
    const end = '2026-09-08T00:00:00.000Z';
    const res = calculateAnnualizedVerifiedSavings(0.01, 0, start, end);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.annualized_savings_usd, 0);
  });

  // Test 6 — Simulation
  it('Test 6: Simulation must never create authoritative savings or payable outcome fee', () => {
    const finding = createMockProductionFinding();
    const state = initializeVerificationState(finding);
    const deployTime = Date.now() - 3600_000;
    const deployedState: VerificationState = {
      ...state,
      stage: 'OBSERVATION_ACTIVE',
      deployment_timestamp: new Date(deployTime).toISOString(),
    };

    const simEvents = createTestEvents(25, {
      is_simulated: true,
      cost: 0.0018,
      baseTimestamp: deployTime + 10_000,
    });

    const evaluated = evaluateVerification(deployedState, finding, simEvents);
    assert.strictEqual(evaluated.stage, 'OBSERVATION_ACTIVE');
    assert.strictEqual(isAuthoritativeVerified(evaluated), false);
    assert.strictEqual(getAuthoritativeVerifiedSavings(evaluated), 0);
    assert.strictEqual(evaluated.observed_result?.annualized_realized_savings_usd, 0);

    const fee = calculateAuthoritativeOutcomeFee(evaluated, finding);
    assert.strictEqual(fee.isPayable, false);
    assert.strictEqual(fee.finalOutcomeFeeUsd, 0);
  });

  // Test 7 — Sample baseline
  it('Test 7: Sample baseline must never create authoritative savings', () => {
    const sampleFinding = createMockProductionFinding({ is_sample_data: true });
    const state = initializeVerificationState(sampleFinding);
    const deployTime = Date.now() - 3600_000;
    const deployedState: VerificationState = {
      ...state,
      stage: 'OBSERVATION_ACTIVE',
      deployment_timestamp: new Date(deployTime).toISOString(),
    };

    const realEvents = createTestEvents(25, {
      is_simulated: false,
      cost: 0.0018,
      baseTimestamp: deployTime + 10_000,
    });

    const evaluated = evaluateVerification(deployedState, sampleFinding, realEvents);
    assert.strictEqual(evaluated.stage, 'OBSERVATION_ACTIVE');
    assert.strictEqual(isAuthoritativeVerified(evaluated), false);
    assert.strictEqual(getAuthoritativeVerifiedSavings(evaluated), 0);

    const fee = calculateAuthoritativeOutcomeFee(evaluated, sampleFinding);
    assert.strictEqual(fee.isPayable, false);
    assert.strictEqual(fee.finalOutcomeFeeUsd, 0);
  });

  // Test 8 — Existing canonical commercial example
  it('Test 8: Canonical commercial example ($1,000/mo verified savings, 20% fee = $2,400, 1-mo cap = $1,000, fee = $1,000)', () => {
    const verifiedMonthly = 1000.0;
    const originalEstimatedMonthly = 1500.0; // Realized ratio: 1000 / 1500 = 66.7% (> 50%)

    const outcome = calculateOutcomeFee(verifiedMonthly, originalEstimatedMonthly);
    assert.strictEqual(outcome.verifiedAnnualizedSavingsUsd, 12000.0);
    assert.strictEqual(outcome.rawOutcomeFeeUsd, 2400.0); // 20% of $12,000
    assert.strictEqual(outcome.capAmountUsd, 1000.0); // 1-month cap
    assert.strictEqual(outcome.protectionTriggered, false);
    assert.strictEqual(outcome.finalOutcomeFeeUsd, 1000.0); // Capped at $1,000
    assert.strictEqual(outcome.isPayable, true);

    // Exact 50% boundary check:
    // Case 1: Exactly 50.00% -> Protection NOT triggered
    const exact50 = calculateOutcomeFee(1000.0, 2000.0);
    assert.strictEqual(exact50.protectionTriggered, false);
    assert.strictEqual(exact50.finalOutcomeFeeUsd, 1000.0);

    // Case 2: 49.99% -> Protection triggered, Fee = $0.00
    const below50 = calculateOutcomeFee(999.8, 2000.0);
    assert.strictEqual(below50.protectionTriggered, true);
    assert.strictEqual(below50.finalOutcomeFeeUsd, 0.0);
    assert.strictEqual(below50.isPayable, false);
  });
});

describe('Cost Validation Integrity Suite (Critical Fix #2)', () => {
  const deployTime = 1700000000000;

  function baseEvent(resolvedCost: unknown): unknown {
    return {
      id: 'evt_cost_check',
      timestamp: new Date(deployTime + 10_000).toISOString(),
      model: 'gpt-4o-mini',
      status: 'SUCCESS',
      resolved_cost_usd: resolvedCost,
    };
  }

  it('Rejects negative cost', () => {
    const ev = baseEvent(-0.005) as AIEvent;
    assert.strictEqual(isValidEventData(ev, deployTime), false);
  });

  it('Rejects zero cost for authoritative verification telemetry', () => {
    const ev = baseEvent(0) as AIEvent;
    assert.strictEqual(isValidEventData(ev, deployTime), false);
  });

  it('Accepts valid strictly positive cost', () => {
    const ev = baseEvent(0.0018) as AIEvent;
    assert.strictEqual(isValidEventData(ev, deployTime), true);
  });

  it('Rejects NaN cost', () => {
    const ev = baseEvent(NaN) as AIEvent;
    assert.strictEqual(isValidEventData(ev, deployTime), false);
  });

  it('Rejects Infinity cost', () => {
    const ev = baseEvent(Infinity) as AIEvent;
    assert.strictEqual(isValidEventData(ev, deployTime), false);
  });

  it('Rejects missing or undefined cost', () => {
    const ev1 = baseEvent(undefined) as AIEvent;
    assert.strictEqual(isValidEventData(ev1, deployTime), false);

    const ev2 = baseEvent(null) as AIEvent;
    assert.strictEqual(isValidEventData(ev2, deployTime), false);
  });
});
