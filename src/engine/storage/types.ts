/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuditSummary,
  DataHealthReport,
  Finding,
  FixPackage,
  TelemetrySource,
  VerificationState,
} from '../../types/domain';

export const AUDIT_SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * Canonical Persisted Local Audit Snapshot
 * Represents the minimum authoritative state required to restore the current audit workflow.
 * Privacy invariant: Raw telemetry, file contents, prompts, completions, stack traces,
 * and arbitrary provider exception messages are NEVER stored in this snapshot.
 */
export interface PersistedAuditSnapshot {
  schema_version: number;
  audit_id: string;
  created_at: string; // ISO-8601 UTC
  source: TelemetrySource;
  is_sample_data: boolean;

  health: DataHealthReport;
  audit_summary: AuditSummary;
  findings: Finding[];
  fix_packages: Record<string, FixPackage>;
  verification_states: Record<string, VerificationState>;

  active_finding_id?: string;
  current_route?: string;
}
