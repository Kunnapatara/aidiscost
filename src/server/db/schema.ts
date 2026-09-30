/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { sqliteTable, text, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_sessions_user_id').on(table.userId),
  index('idx_sessions_expires_at').on(table.expiresAt),
]);

export const findingOwnerships = sqliteTable('finding_ownerships', {
  findingId: text('finding_id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_finding_ownerships_owner_id').on(table.ownerId),
]);

export const entitlements = sqliteTable('entitlements', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  findingId: text('finding_id').notNull(),
  type: text('type').notNull(), // 'PAID_FIX_PACKAGE' | 'DEMO_PREVIEW'
  status: text('status').notNull(), // 'ACTIVE' | 'REVOKED'
  provider: text('provider').notNull(), // 'LEMON_SQUEEZY' | 'DEMO_ADAPTER'
  providerTransactionId: text('provider_transaction_id').notNull(),
  amountUsd: real('amount_usd').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_entitlements_user_finding').on(table.userId, table.findingId),
  index('idx_entitlements_user_id').on(table.userId),
]);

export const webhookEvents = sqliteTable('webhook_events', {
  eventId: text('event_id').primaryKey(),
  provider: text('provider').notNull(),
  eventName: text('event_name').notNull(),
  userId: text('user_id'),
  findingId: text('finding_id'),
  orderId: text('order_id'),
  processedAt: text('processed_at').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;
export type FindingOwnershipRow = typeof findingOwnerships.$inferSelect;
export type FindingOwnershipInsert = typeof findingOwnerships.$inferInsert;
export type EntitlementRow = typeof entitlements.$inferSelect;
export type EntitlementInsert = typeof entitlements.$inferInsert;
export type WebhookEventRow = typeof webhookEvents.$inferSelect;
export type WebhookEventInsert = typeof webhookEvents.$inferInsert;
