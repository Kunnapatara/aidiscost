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
    baseline_spend_usd: 100.0,
    candidate_spend_usd: 15.0,
    estimated_savings_usd: 85.0,
    potential_savings_pct: 85.0,
    annualized_projection_usd: 4420.0,
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
  } = {}
): AIEvent[] {
  const baseTime = params.baseTimestamp ?? Date.now() - 1800_000;
  const events: AIEvent[] = [];

  for (let i = 0; i < count; i++) {
    events.push({
      id: `evt_m_${i}_${Math.random().toString(36).substring(2, 6)}`,
      source: 'custom_logs',
      source_event_id: `src_${i}`,
      timestamp: new Date(baseTime + (i + 1) * 10_000).toISOString(),
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
      source_reported_cost_usd: params.cost ?? 0.0018,
      calculated_cost_usd: params.cost ?? 0.0018,
      resolved_cost_usd: params.cost ?? 0.0018,
      cost_provenance: 'CALCULATED',
      cost_confidence: 'HIGH',
      metadata: {},
      is_simulated: params.is_simulated,
    });
  }

  return events;
}

describe('Commercial Verification Annualization Matrix (Tests A - K)', () => {
  // Test A — 7-day window
  it('Test A: 7-day window derives annualization as observed / 7 * 365', () => {
    const start = '2026-09-01T00:00:00.000Z';
    const end = '2026-09-08T00:00:00.000Z'; // Exactly 7 days
    const sampleCount = 700;
    const costDelta = 0.01; // observed savings = 700 * 0.01 = $7.00

    const result = calculateAnnualizedVerifiedSavings(costDelta, sampleCount, start, end);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.duration_days, 7);
    // (7.00 / 7) * 365 = 365.00
    assert.strictEqual(result.annualized_savings_usd, 365.0);
  });

  // Test B — 30-day window
  it('Test B: 30-day window derives annualization as observed / 30 * 365', () => {
    const start = '2026-08-01T00:00:00.000Z';
    const end = '2026-08-31T00:00:00.000Z'; // Exactly 30 days
    const sampleCount = 3000;
    const costDelta = 0.02; // observed savings = 3000 * 0.02 = $60.00

    const result = calculateAnnualizedVerifiedSavings(costDelta, sampleCount, start, end);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.duration_days, 30);
    // (60.00 / 30) * 365 = 730.00
    assert.strictEqual(result.annualized_savings_usd, 730.0);
  });

  // Test C — 1-day window
  it('Test C: 1-day window (24 hours) derives annualization as observed / 1 * 365', () => {
    const start = '2026-09-15T00:00:00.000Z';
    const end = '2026-09-16T00:00:00.000Z'; // Exactly 1 day
    const sampleCount = 100;
    const costDelta = 0.05; // observed savings = 100 * 0.05 = $5.00

    const result = calculateAnnualizedVerifiedSavings(costDelta, sampleCount, start, end);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.duration_days, 1);
    // (5.00 / 1) * 365 = 1825.00
    assert.strictEqual(result.annualized_savings_usd, 1825.0);
  });

  // Test D — invalid interval (end <= start)
  it('Test D: Invalid interval (end <= start) withholds annualization', () => {
    const start = '2026-09-10T00:00:00.000Z';
    const end = '2026-09-05T00:00:00.000Z';
    const result = calculateAnnualizedVerifiedSavings(0.01, 100, start, end);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.annualized_savings_usd, 0);
  });

  // Test E — zero duration (end === start)
  it('Test E: Zero duration (end === start) withholds annualization', () => {
    const start = '2026-09-10T12:00:00.000Z';
    const end = '2026-09-10T12:00:00.000Z';
    const result = calculateAnnualizedVerifiedSavings(0.01, 100, start, end);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.annualized_savings_usd, 0);
  });

  // Test F — NaN
  it('Test F: NaN inputs withhold annualization', () => {
    const start = '2026-09-01T00:00:00.000Z';
    const end = '2026-09-08T00:00:00.000Z';
    const res1 = calculateAnnualizedVerifiedSavings(NaN, 100, start, end);
    assert.strictEqual(res1.valid, false);

    const res2 = calculateAnnualizedVerifiedSavings(0.01, NaN, start, end);
    assert.strictEqual(res2.valid, false);

    const res3 = calculateAnnualizedVerifiedSavings(0.01, 100, 'invalid-date', end);
    assert.strictEqual(res3.valid, false);
  });

  // Test G — Infinity
  it('Test G: Infinity inputs withhold annualization', () => {
    const start = '2026-09-01T00:00:00.000Z';
    const end = '2026-09-08T00:00:00.000Z';
    const res1 = calculateAnnualizedVerifiedSavings(Infinity, 100, start, end);
    assert.strictEqual(res1.valid, false);

    const res2 = calculateAnnualizedVerifiedSavings(0.01, Infinity, start, end);
    assert.strictEqual(res2.valid, false);
  });

  // Test H — zero event count
  it('Test H: Zero event count withholds annualization', () => {
    const start = '2026-09-01T00:00:00.000Z';
    const end = '2026-09-08T00:00:00.000Z';
    const result = calculateAnnualizedVerifiedSavings(0.01, 0, start, end);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.annualized_savings_usd, 0);
  });

  // Test I — simulated telemetry
  it('Test I: Simulated telemetry must never produce authoritative commercial annualized savings', () => {
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

  // Test J — sample/demo telemetry
  it('Test J: Sample/demo baseline telemetry must never produce authoritative commercial annualized savings', () => {
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

  // Test K — canonical commercial example
  it('Test K: Canonical commercial example ($1,000/mo verified savings, 20% fee = $2,400, 1-mo cap = $1,000, fee = $1,000)', () => {
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
