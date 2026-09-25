/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface UserSession {
  token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export type EntitlementType = 'PAID_FIX_PACKAGE' | 'DEMO_PREVIEW';

export type EntitlementStatus = 'ACTIVE' | 'REVOKED';

export interface Entitlement {
  id: string;
  user_id: string;
  finding_id: string;
  type: EntitlementType;
  status: EntitlementStatus;
  provider: 'LEMON_SQUEEZY' | 'DEMO_ADAPTER';
  provider_transaction_id: string;
  amount_usd: number;
  created_at: string;
  updated_at: string;
}

export interface FindingOwnership {
  finding_id: string;
  owner_id: string;
  created_at: string;
}

export interface ProcessedWebhookEvent {
  event_id: string;
  provider: 'LEMON_SQUEEZY';
  event_name: string;
  user_id?: string;
  finding_id?: string;
  order_id?: string;
  processed_at: string;
}

export interface LemonSqueezyConfig {
  apiKey: string;
  storeId: string;
  variantId: string;
  webhookSecret: string;
  isConfigured: boolean;
}
