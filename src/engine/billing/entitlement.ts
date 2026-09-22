/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EntitlementRecord {
  finding_id: string;
  order_id: string;
  customer_email?: string;
  unlocked_at: string;
  amount_usd: number;
}

export class BillingEntitlementStore {
  private static instance: BillingEntitlementStore;
  private processedWebhookEvents = new Set<string>();
  private entitlements = new Map<string, EntitlementRecord>();

  private constructor() {
    // Check localStorage for persisted test entitlements
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem('aidiscost_entitlements');
        if (stored) {
          const list: EntitlementRecord[] = JSON.parse(stored);
          for (const item of list) {
            this.entitlements.set(item.finding_id, item);
          }
        }
      } catch {
        // ignore storage errors
      }
    }
  }

  static getInstance(): BillingEntitlementStore {
    if (!BillingEntitlementStore.instance) {
      BillingEntitlementStore.instance = new BillingEntitlementStore();
    }
    return BillingEntitlementStore.instance;
  }

  isUnlocked(findingId: string): boolean {
    return this.entitlements.has(findingId);
  }

  getEntitlement(findingId: string): EntitlementRecord | undefined {
    return this.entitlements.get(findingId);
  }

  /**
   * Deterministic webhook processor with strict idempotency check
   */
  processWebhookEvent(
    eventId: string,
    findingId: string,
    orderId: string,
    customerEmail?: string
  ): { status: 'SUCCESS' | 'IDEMPOTENT_DUPLICATE'; entitlement: EntitlementRecord } {
    if (this.processedWebhookEvents.has(eventId)) {
      const existing = this.entitlements.get(findingId)!;
      return { status: 'IDEMPOTENT_DUPLICATE', entitlement: existing };
    }

    this.processedWebhookEvents.add(eventId);

    const record: EntitlementRecord = {
      finding_id: findingId,
      order_id: orderId,
      customer_email: customerEmail || 'customer@example.com',
      unlocked_at: new Date().toISOString(),
      amount_usd: 49.00,
    };

    this.entitlements.set(findingId, record);

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const list = Array.from(this.entitlements.values());
        window.localStorage.setItem('aidiscost_entitlements', JSON.stringify(list));
      } catch {
        // ignore
      }
    }

    return { status: 'SUCCESS', entitlement: record };
  }

  /**
   * Direct unlock for simulation/testing mode
   */
  unlockFixPackage(findingId: string): EntitlementRecord {
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const eventId = `wh_sim_${Date.now()}`;
    const res = this.processWebhookEvent(eventId, findingId, orderId);
    return res.entitlement;
  }
}
