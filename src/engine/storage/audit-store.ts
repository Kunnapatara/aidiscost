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
import { AUDIT_SNAPSHOT_SCHEMA_VERSION, PersistedAuditSnapshot } from './types';

const DB_NAME = 'aidiscost_local_db';
const DB_VERSION = 1;
const STORE_NAME = 'audit_snapshots';

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

          req.onupgradeneeded = (event) => {
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
   * Builds a canonical PersistedAuditSnapshot from current runtime state
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

    return {
      schema_version: AUDIT_SNAPSHOT_SCHEMA_VERSION,
      audit_id: auditSummary.id,
      created_at: auditSummary.created_at || new Date().toISOString(),
      source: auditSummary.source,
      is_sample_data: Boolean(auditSummary.is_sample_data),
      health: healthReport,
      audit_summary: auditSummary,
      findings: findings || auditSummary.findings || [],
      fix_packages: fixPackagesRecord,
      verification_states: verificationStatesRecord,
      active_finding_id: activeFindingId,
      current_route: currentRoute,
    };
  }

  /**
   * Validates snapshot structural and version integrity.
   * Returns true if valid, false if corrupt or unsupported version.
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

    return true;
  }

  /**
   * Saves a canonical audit snapshot into IndexedDB.
   * Storage failures are caught and handled gracefully without crashing the app.
   */
  static async saveAuditSnapshot(snapshot: PersistedAuditSnapshot): Promise<boolean> {
    if (!this.validateSnapshot(snapshot)) {
      console.warn('[AuditStore] Refusing to persist invalid or incompatible snapshot');
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
