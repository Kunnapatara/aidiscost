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
import {
  AUDIT_SNAPSHOT_SCHEMA_VERSION,
  PersistedAuditSnapshot,
  PersistedAuditSummary,
  PersistedEventSample,
  PersistedFinding,
  PersistedFindingEvidence,
} from './types';

const DB_NAME = 'aidiscost_local_db';
const DB_VERSION = 1;
const STORE_NAME = 'audit_snapshots';

/**
 * Strict allowlisted keys for event samples in evidence.
 * Any key not explicitly in this set is stripped during persistence.
 */
const ALLOWED_SAMPLE_EVENT_KEYS = new Set<string>([
  'id',
  'source',
  'source_event_id',
  'timestamp',
  'provider',
  'model',
  'operation',
  'input_tokens',
  'output_tokens',
  'total_tokens',
  'latency_ms',
  'status',
  'error_code',
  'trace_id',
  'parent_id',
  'tool_calls',
  'prompt_hash',
  'source_reported_cost_usd',
  'calculated_cost_usd',
  'resolved_cost_usd',
  'cost_provenance',
  'cost_confidence',
  'quality_signal',
]);

/**
 * Keys explicitly banned anywhere in the persisted snapshot.
 */
const DISALLOWED_KEYS = new Set<string>([
  'prompt',
  'completion',
  'raw_prompt',
  'raw_completion',
  'request_body',
  'response_body',
  'raw_payload',
  'payload',
  'stack',
  'stack_trace',
  'exception',
  'error_message',
  'provider_response',
  'api_key',
  'authorization',
  'cookie',
  'metadata', // arbitrary user text dictionary
]);

export class AuditStore {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Internal database opener with lazy initialization
   */
  private static getDB(): Promise<IDBDatabase> {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available in current environment'));
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        try {
          const req = indexedDB.open(DB_NAME, DB_VERSION);

          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              const store = db.createObjectStore(STORE_NAME, { keyPath: 'audit_id' });
              store.createIndex('created_at', 'created_at', { unique: false });
            }
          };

          req.onsuccess = () => {
            resolve(req.result);
          };

          req.onerror = () => {
            reject(req.error || new Error('Failed to open IndexedDB'));
          };

          req.onblocked = () => {
            console.warn('[AuditStore] IndexedDB open blocked by other tabs');
          };
        } catch (err) {
          reject(err);
        }
      });
    }

    return this.dbPromise;
  }

  /**
   * Sanitizes a sample event into a strict allowlist-only DTO.
   * Strips metadata, raw prompts/completions, and any unallowed fields.
   */
  static sanitizeSampleEvent(raw: unknown): PersistedEventSample {
    if (!raw || typeof raw !== 'object') return {};
    const src = raw as Record<string, unknown>;
    const clean: Record<string, unknown> = {};

    for (const key of ALLOWED_SAMPLE_EVENT_KEYS) {
      if (src[key] !== undefined) {
        clean[key] = src[key];
      }
    }

    return clean as PersistedEventSample;
  }

  /**
   * Sanitizes finding evidence into a privacy-safe DTO.
   */
  static sanitizeEvidence(evidence: unknown): PersistedFindingEvidence {
    if (!evidence || typeof evidence !== 'object') {
      return {
        affected_event_count: 0,
        sample_events: [],
        metrics_comparison: [],
        trace_samples: [],
        mathematical_proof: '',
      };
    }

    const ev = evidence as Partial<PersistedFindingEvidence>;
    const sampleEvents = Array.isArray(ev.sample_events)
      ? ev.sample_events.map(e => this.sanitizeSampleEvent(e))
      : [];

    return {
      affected_event_count: typeof ev.affected_event_count === 'number' ? ev.affected_event_count : 0,
      sample_events: sampleEvents,
      metrics_comparison: Array.isArray(ev.metrics_comparison) ? [...ev.metrics_comparison] : [],
      trace_samples: Array.isArray(ev.trace_samples) ? [...ev.trace_samples] : [],
      mathematical_proof: typeof ev.mathematical_proof === 'string' ? ev.mathematical_proof : '',
    };
  }

  /**
   * Sanitizes a runtime Finding into a PersistedFinding DTO.
   */
  static sanitizeFinding(finding: Finding): PersistedFinding {
    return {
      id: finding.id,
      audit_id: finding.audit_id,
      rule_id: finding.rule_id,
      title: finding.title,
      summary: finding.summary,
      affected_scope: finding.affected_scope,
      detection_confidence: finding.detection_confidence,
      cost_confidence: finding.cost_confidence,
      savings_confidence: finding.savings_confidence,
      baseline_spend_usd: finding.baseline_spend_usd,
      candidate_spend_usd: finding.candidate_spend_usd,
      estimated_savings_usd: finding.estimated_savings_usd,
      potential_savings_pct: finding.potential_savings_pct,
      annualized_projection_usd: finding.annualized_projection_usd,
      eligible_event_count: finding.eligible_event_count,
      calculation_method: finding.calculation_method,
      assumptions: Array.isArray(finding.assumptions) ? [...finding.assumptions] : [],
      evidence: this.sanitizeEvidence(finding.evidence),
      status: finding.status,
      is_sample_data: Boolean(finding.is_sample_data),
    };
  }

  /**
   * Builds a canonical, privacy-safe PersistedAuditSnapshot from current runtime state
   */
  static buildSnapshot(params: {
    auditSummary: AuditSummary;
    healthReport: DataHealthReport;
    findings?: Finding[];
    fixPackages: Map<string, FixPackage> | Record<string, FixPackage>;
    verificationStates: Map<string, VerificationState> | Record<string, VerificationState>;
    activeFindingId?: string;
    currentRoute?: string;
  }): PersistedAuditSnapshot {
    const { auditSummary, healthReport, findings, fixPackages, verificationStates, activeFindingId, currentRoute } = params;

    const fixPackagesRecord: Record<string, FixPackage> =
      fixPackages instanceof Map ? Object.fromEntries(fixPackages.entries()) : { ...fixPackages };

    const verificationStatesRecord: Record<string, VerificationState> =
      verificationStates instanceof Map ? Object.fromEntries(verificationStates.entries()) : { ...verificationStates };

    const runtimeFindings = findings || auditSummary.findings || [];
    const persistedFindings = runtimeFindings.map(f => this.sanitizeFinding(f));

    const persistedSummary: PersistedAuditSummary = {
      id: auditSummary.id,
      created_at: auditSummary.created_at || new Date().toISOString(),
      source: auditSummary.source,
      total_spend_usd: auditSummary.total_spend_usd,
      potential_savings_usd: auditSummary.potential_savings_usd,
      annualized_savings_projection_usd: auditSummary.annualized_savings_projection_usd,
      health: healthReport,
      findings: persistedFindings,
      is_sample_data: Boolean(auditSummary.is_sample_data),
    };

    return {
      schema_version: AUDIT_SNAPSHOT_SCHEMA_VERSION,
      audit_id: auditSummary.id,
      created_at: persistedSummary.created_at,
      source: auditSummary.source,
      is_sample_data: Boolean(auditSummary.is_sample_data),
      health: healthReport,
      audit_summary: persistedSummary,
      findings: persistedFindings,
      fix_packages: fixPackagesRecord,
      verification_states: verificationStatesRecord,
      active_finding_id: activeFindingId,
      current_route: currentRoute,
    };
  }

  /**
   * Deeply scans an object or array to ensure no disallowed keys exist anywhere.
   */
  private static containsDisallowedKeys(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (this.containsDisallowedKeys(item)) return true;
      }
      return false;
    }

    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (DISALLOWED_KEYS.has(key.toLowerCase())) {
        return true;
      }
      if (typeof record[key] === 'object' && record[key] !== null) {
        if (this.containsDisallowedKeys(record[key])) return true;
      }
    }

    return false;
  }

  /**
   * Validates snapshot structural, version, and privacy integrity.
   * Returns true if valid, false if corrupt, unsupported version, or privacy violation.
   */
  static validateSnapshot(data: unknown): data is PersistedAuditSnapshot {
    if (!data || typeof data !== 'object') return false;
    const s = data as Partial<PersistedAuditSnapshot>;

    // Schema version gate
    if (s.schema_version !== AUDIT_SNAPSHOT_SCHEMA_VERSION) {
      return false;
    }

    // Required fields check
    if (
      typeof s.audit_id !== 'string' ||
      !s.audit_id.trim() ||
      typeof s.created_at !== 'string' ||
      typeof s.source !== 'string' ||
      typeof s.is_sample_data !== 'boolean' ||
      !s.health ||
      typeof s.health !== 'object' ||
      !s.audit_summary ||
      typeof s.audit_summary !== 'object' ||
      !Array.isArray(s.findings) ||
      !s.fix_packages ||
      typeof s.fix_packages !== 'object' ||
      !s.verification_states ||
      typeof s.verification_states !== 'object'
    ) {
      return false;
    }

    // Stable ID invariant
    if (s.audit_id !== s.audit_summary.id) {
      return false;
    }

    // Check findings integrity
    for (const f of s.findings) {
      if (
        !f ||
        typeof f !== 'object' ||
        typeof f.id !== 'string' ||
        typeof f.audit_id !== 'string' ||
        typeof f.baseline_spend_usd !== 'number' ||
        typeof f.candidate_spend_usd !== 'number' ||
        typeof f.estimated_savings_usd !== 'number' ||
        !f.evidence ||
        !Array.isArray(f.evidence.sample_events)
      ) {
        return false;
      }

      // Check sample_events privacy allowlist
      for (const sample of f.evidence.sample_events) {
        if (!sample || typeof sample !== 'object') return false;
        const keys = Object.keys(sample);
        for (const k of keys) {
          if (!ALLOWED_SAMPLE_EVENT_KEYS.has(k)) {
            return false; // Rejects any unallowed key (e.g. metadata, prompt, user_text)
          }
        }
      }
    }

    // Privacy boundary deep scan: reject any snapshot containing disallowed keys
    if (this.containsDisallowedKeys(s)) {
      return false;
    }

    return true;
  }

  /**
   * Saves a canonical audit snapshot into IndexedDB.
   * Storage failures are caught and handled gracefully without crashing the app.
   */
  static async saveAuditSnapshot(snapshot: PersistedAuditSnapshot): Promise<boolean> {
    if (!this.validateSnapshot(snapshot)) {
      console.warn('[AuditStore] Refusing to persist invalid or privacy-violating snapshot');
      return false;
    }

    try {
      const db = await this.getDB();
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(snapshot);

        req.onsuccess = () => resolve(true);
        req.onerror = () => {
          console.warn('[AuditStore] Failed to write audit snapshot to IndexedDB');
          resolve(false);
        };
        tx.onabort = () => resolve(false);
      });
    } catch (err) {
      console.warn('[AuditStore] Storage save error:', (err as Error).message);
      return false;
    }
  }

  /**
   * Loads a specific audit snapshot by audit_id.
   * Returns null if not found, corrupt, or unsupported schema version.
   */
  static async loadAuditSnapshot(auditId: string): Promise<PersistedAuditSnapshot | null> {
    if (!auditId) return null;

    try {
      const db = await this.getDB();
      return new Promise<PersistedAuditSnapshot | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(auditId);

        req.onsuccess = () => {
          const val = req.result;
          if (AuditStore.validateSnapshot(val)) {
            resolve(val);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Loads the latest valid audit snapshot ordered by created_at.
   * Returns null if empty or if no valid records exist.
   */
  static async loadLatestAuditSnapshot(): Promise<PersistedAuditSnapshot | null> {
    try {
      const db = await this.getDB();
      return new Promise<PersistedAuditSnapshot | null>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const results = req.result;
          if (!Array.isArray(results) || results.length === 0) {
            resolve(null);
            return;
          }

          // Filter valid snapshots and sort descending by created_at
          const valid = results.filter((item): item is PersistedAuditSnapshot =>
            AuditStore.validateSnapshot(item)
          );

          if (valid.length === 0) {
            resolve(null);
            return;
          }

          valid.sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          resolve(valid[0]);
        };

        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Deletes a specific audit snapshot by audit_id.
   */
  static async deleteAuditSnapshot(auditId: string): Promise<boolean> {
    if (!auditId) return false;

    try {
      const db = await this.getDB();
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(auditId);

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  /**
   * Clears all persisted audit snapshots.
   */
  static async clearAuditSnapshots(): Promise<boolean> {
    try {
      const db = await this.getDB();
      return new Promise<boolean>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
}
