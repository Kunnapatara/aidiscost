/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AIEvent, AuditSummary, DataHealthReport, Finding, TelemetrySource } from '../../types/domain';
import { evaluateModelRightSizing } from './right-sizing';
import { evaluateRetryErrorLoop } from './retry-loop';
import { evaluateRepeatedCallPattern } from './repeated-call';

export function runOptimizationRules(
  events: AIEvent[],
  source: TelemetrySource,
  health: DataHealthReport,
  isSampleData: boolean
): AuditSummary {
  const auditId = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const findings: Finding[] = [];

  // Total analyzed spend
  let totalSpend = 0;
  for (const ev of events) {
    totalSpend += ev.resolved_cost_usd;
  }

  // Only run rules if data health is at least USABLE_WITH_ESTIMATES
  if (health.health_grade !== 'INSUFFICIENT_DATA' && events.length >= 5) {
    // Rule A: Model Right-Sizing
    const findingA = evaluateModelRightSizing(events, auditId, isSampleData);
    if (findingA) {
      findings.push(findingA);
    }

    // Rule B: Retry / Error Loop
    const findingB = evaluateRetryErrorLoop(events, auditId, isSampleData);
    if (findingB) {
      findings.push(findingB);
    }

    // Rule C: Repeated Call Pattern
    const findingC = evaluateRepeatedCallPattern(events, auditId, isSampleData);
    if (findingC) {
      findings.push(findingC);
    }
  }

  // Calculate potential savings (without double counting events)
  const potentialSavings = findings.reduce((sum, f) => sum + f.estimated_savings_usd, 0);
  const annualizedProjection = findings.reduce((sum, f) => sum + f.annualized_projection_usd, 0);

  return {
    id: auditId,
    created_at: new Date().toISOString(),
    source,
    total_spend_usd: Number(totalSpend.toFixed(4)),
    potential_savings_usd: Number(potentialSavings.toFixed(4)),
    annualized_savings_projection_usd: Number(annualizedProjection.toFixed(2)),
    health,
    findings,
    is_sample_data: isSampleData,
  };
}
