/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ConfidenceLevel,
  CostProvenance,
  DataHealthReport,
  FindingStatus,
  FixPackage,
  HealthGrade,
  RuleType,
  TelemetrySource,
  VerificationStage,
  VerificationState,
} from '../../types/domain';

export const AUDIT_SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Strict allowlisted persistence representation for event samples in evidence.
 * Privacy invariant: Arbitrary metadata, prompt, completion, request/response bodies,
 * stack traces, and arbitrary error messages are NEVER persisted.
 */
export interface PersistedEventSample {
  id?: string;
  source?: TelemetrySource;
  source_event_id?: string;
  timestamp?: string;
  provider?: string;
  model?: string;
  operation?: 'chat' | 'completion' | 'embedding' | 'tool_call';
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  latency_ms?: number;
  status?: 'SUCCESS' | 'ERROR' | 'TIMEOUT' | 'RATE_LIMITED';
  error_code?: string;
  trace_id?: string;
  parent_id?: string;
  tool_calls?: {
    name?: string;
    count: number;
  }[];
  prompt_hash?: string;
  source_reported_cost_usd?: number | null;
  calculated_cost_usd?: number | null;
  resolved_cost_usd?: number;
  cost_provenance?: CostProvenance;
  cost_confidence?: ConfidenceLevel;
  quality_signal?: number;
}

/**
 * Persistence-safe Finding Evidence representation
 */
export interface PersistedFindingEvidence {
  affected_event_count: number;
  sample_events: PersistedEventSample[];
  metrics_comparison: {
    label: string;
    current_value: string | number;
    target_value: string | number;
    provenance: CostProvenance | 'VERIFIED';
  }[];
  trace_samples: string[];
  mathematical_proof: string;
}

/**
 * Persistence-safe Finding representation
 */
export interface PersistedFinding {
  id: string;
  audit_id: string;
  rule_id: RuleType;
  title: string;
  summary: string;
  affected_scope: string;
  detection_confidence: ConfidenceLevel;
  cost_confidence: ConfidenceLevel;
  savings_confidence: ConfidenceLevel;
  baseline_spend_usd: number;
  candidate_spend_usd: number;
  estimated_savings_usd: number;
  potential_savings_pct: number;
  annualized_projection_usd: number;
  eligible_event_count: number;
  calculation_method: string;
  assumptions: string[];
  evidence: PersistedFindingEvidence;
  status: FindingStatus;
  is_sample_data: boolean;
}

/**
 * Persistence-safe Audit Summary representation
 */
export interface PersistedAuditSummary {
  id: string;
  created_at: string;
  source: TelemetrySource;
  total_spend_usd: number;
  potential_savings_usd: number;
  annualized_savings_projection_usd: number;
  health: DataHealthReport;
  findings: PersistedFinding[];
  is_sample_data: boolean;
}

/**
 * Canonical Persisted Local Audit Snapshot
 * Represents the authoritative analytical state required to restore the current audit workflow.
 * Privacy invariant: Raw telemetry, file contents, prompts, completions, stack traces,
 * arbitrary metadata, and arbitrary provider exception messages are NEVER stored in this snapshot.
 */
export interface PersistedAuditSnapshot {
  schema_version: number;
  audit_id: string;
  created_at: string; // ISO-8601 UTC
  source: TelemetrySource;
  is_sample_data: boolean;

  health: DataHealthReport;
  audit_summary: PersistedAuditSummary;
  findings: PersistedFinding[];
  fix_packages: Record<string, FixPackage>;
  verification_states: Record<string, VerificationState>;

  active_finding_id?: string;
  current_route?: string;
}
