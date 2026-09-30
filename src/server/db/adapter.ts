/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { eq, and } from 'drizzle-orm';
import { LibSQLDatabase } from 'drizzle-orm/libsql';
import { Client } from '@libsql/client';
import * as schema from './schema';
import { IStorage } from '../storage-interface';
import { User, UserSession, Entitlement, FindingOwnership, ProcessedWebhookEvent } from '../types';

export class DrizzleStorageAdapter implements IStorage {
  private db: LibSQLDatabase<typeof schema>;
  private client: Client;
  private inFlightWebhooks: Set<string> = new Set<string>();
  private processedWebhooksCache: Set<string> = new Set<string>();
  private isTestMode = false;

  constructor(db: LibSQLDatabase<typeof schema>, client: Client) {
    this.db = db;
    this.client = client;
  }

  setTestMode(isTest: boolean): void {
    this.isTestMode = isTest;
  }

  async clearAll(): Promise<void> {
    this.inFlightWebhooks.clear();
    this.processedWebhooksCache.clear();
    await this.db.delete(schema.webhookEvents);
    await this.db.delete(schema.entitlements);
    await this.db.delete(schema.findingOwnerships);
    await this.db.delete(schema.sessions);
    await this.db.delete(schema.users);
  }

  // --- User Operations ---
  async createUser(user: User): Promise<User> {
    const normalizedEmail = user.email.trim().toLowerCase();
    const existing = await this.getUserByEmail(normalizedEmail);
    if (existing) {
      throw new Error(`User with email ${normalizedEmail} already exists`);
    }

    await this.db.insert(schema.users).values({
      id: user.id,
      email: normalizedEmail,
      passwordHash: user.password_hash,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });

    return { ...user, email: normalizedEmail };
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, normalizedEmail))
      .limit(1);

    if (!rows[0]) return null;

    return {
      id: rows[0].id,
      email: rows[0].email,
      password_hash: rows[0].passwordHash,
      created_at: rows[0].createdAt,
      updated_at: rows[0].updatedAt,
    };
  }

  async getUserById(id: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    if (!rows[0]) return null;

    return {
      id: rows[0].id,
      email: rows[0].email,
      password_hash: rows[0].passwordHash,
      created_at: rows[0].createdAt,
      updated_at: rows[0].updatedAt,
    };
  }

  // --- Session Operations ---
  async createSession(session: UserSession): Promise<UserSession> {
    await this.db.insert(schema.sessions).values({
      token: session.token,
      userId: session.user_id,
      expiresAt: session.expires_at,
      createdAt: session.created_at,
    });
    return session;
  }

  async getSession(token: string): Promise<{ session: UserSession; user: User } | null> {
    if (!token) return null;

    const rows = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.token, token))
      .limit(1);

    if (!rows[0]) return null;

    // Check expiration
    if (new Date(rows[0].expiresAt).getTime() < Date.now()) {
      await this.deleteSession(token);
      return null;
    }

    const user = await this.getUserById(rows[0].userId);
    if (!user) {
      await this.deleteSession(token);
      return null;
    }

    return {
      session: {
        token: rows[0].token,
        user_id: rows[0].userId,
        expires_at: rows[0].expiresAt,
        created_at: rows[0].createdAt,
      },
      user,
    };
  }

  async deleteSession(token: string): Promise<boolean> {
    const res = await this.db.delete(schema.sessions).where(eq(schema.sessions.token, token));
    return (res.rowsAffected ?? 0) > 0;
  }

  // --- Finding Ownership Operations ---
  async registerFindingOwnership(findingId: string, ownerId: string): Promise<FindingOwnership> {
    const existing = await this.db
      .select()
      .from(schema.findingOwnerships)
      .where(eq(schema.findingOwnerships.findingId, findingId))
      .limit(1);

    if (existing[0]) {
      return {
        finding_id: existing[0].findingId,
        owner_id: existing[0].ownerId,
        created_at: existing[0].createdAt,
      };
    }

    const now = new Date().toISOString();
    await this.db
      .insert(schema.findingOwnerships)
      .values({
        findingId,
        ownerId,
        createdAt: now,
      })
      .onConflictDoNothing();

    const current = await this.db
      .select()
      .from(schema.findingOwnerships)
      .where(eq(schema.findingOwnerships.findingId, findingId))
      .limit(1);

    return {
      finding_id: current[0].findingId,
      owner_id: current[0].ownerId,
      created_at: current[0].createdAt,
    };
  }

  async getFindingOwner(findingId: string): Promise<string | null> {
    const rows = await this.db
      .select({ ownerId: schema.findingOwnerships.ownerId })
      .from(schema.findingOwnerships)
      .where(eq(schema.findingOwnerships.findingId, findingId))
      .limit(1);

    return rows[0] ? rows[0].ownerId : null;
  }

  async listUserFindings(ownerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ findingId: schema.findingOwnerships.findingId })
      .from(schema.findingOwnerships)
      .where(eq(schema.findingOwnerships.ownerId, ownerId));

    return rows.map((r) => r.findingId);
  }

  // --- Entitlement Operations ---
  async createEntitlement(entitlement: Entitlement): Promise<Entitlement> {
    await this.db
      .insert(schema.entitlements)
      .values({
        id: entitlement.id,
        userId: entitlement.user_id,
        findingId: entitlement.finding_id,
        type: entitlement.type,
        status: entitlement.status,
        provider: entitlement.provider,
        providerTransactionId: entitlement.provider_transaction_id,
        amountUsd: entitlement.amount_usd,
        createdAt: entitlement.created_at,
        updatedAt: entitlement.updated_at,
      })
      .onConflictDoUpdate({
        target: [schema.entitlements.userId, schema.entitlements.findingId],
        set: {
          status: entitlement.status,
          provider: entitlement.provider,
          providerTransactionId: entitlement.provider_transaction_id,
          amountUsd: entitlement.amount_usd,
          updatedAt: entitlement.updated_at,
        },
      });

    return entitlement;
  }

  async getEntitlement(userId: string, findingId: string): Promise<Entitlement | null> {
    const rows = await this.db
      .select()
      .from(schema.entitlements)
      .where(
        and(
          eq(schema.entitlements.userId, userId),
          eq(schema.entitlements.findingId, findingId)
        )
      )
      .limit(1);

    if (!rows[0]) return null;

    return {
      id: rows[0].id,
      user_id: rows[0].userId,
      finding_id: rows[0].findingId,
      type: rows[0].type as any,
      status: rows[0].status as any,
      provider: rows[0].provider as any,
      provider_transaction_id: rows[0].providerTransactionId,
      amount_usd: rows[0].amountUsd,
      created_at: rows[0].createdAt,
      updated_at: rows[0].updatedAt,
    };
  }

  async hasActivePaidEntitlement(userId: string, findingId: string): Promise<boolean> {
    const entitlement = await this.getEntitlement(userId, findingId);
    return Boolean(
      entitlement &&
      entitlement.type === 'PAID_FIX_PACKAGE' &&
      entitlement.status === 'ACTIVE'
    );
  }

  // --- Webhook Idempotency Operations ---
  async isWebhookEventProcessed(eventId: string): Promise<boolean> {
    if (this.processedWebhooksCache.has(eventId) || this.inFlightWebhooks.has(eventId)) {
      return true;
    }
    const rows = await this.db
      .select({ eventId: schema.webhookEvents.eventId })
      .from(schema.webhookEvents)
      .where(eq(schema.webhookEvents.eventId, eventId))
      .limit(1);

    if (rows[0]) {
      this.processedWebhooksCache.add(eventId);
      return true;
    }
    return false;
  }

  claimWebhookEvent(eventId: string): 'PROCEED' | 'DUPLICATE' | 'IN_FLIGHT' {
    if (this.processedWebhooksCache.has(eventId)) {
      return 'DUPLICATE';
    }
    if (this.inFlightWebhooks.has(eventId)) {
      return 'IN_FLIGHT';
    }
    this.inFlightWebhooks.add(eventId);
    return 'PROCEED';
  }

  releaseWebhookClaim(eventId: string): void {
    this.inFlightWebhooks.delete(eventId);
  }

  async recordProcessedWebhook(event: ProcessedWebhookEvent): Promise<void> {
    await this.db
      .insert(schema.webhookEvents)
      .values({
        eventId: event.event_id,
        provider: event.provider,
        eventName: event.event_name,
        userId: event.user_id,
        findingId: event.finding_id,
        orderId: event.order_id,
        processedAt: event.processed_at,
      })
      .onConflictDoNothing();

    this.processedWebhooksCache.add(event.event_id);
    this.inFlightWebhooks.delete(event.event_id);
  }

  // --- Atomic Commercial Webhook Transaction ---
  async processOrderCreatedWebhookTransaction(params: {
    event: ProcessedWebhookEvent;
    entitlement: Entitlement;
  }): Promise<{ status: 'SUCCESS' | 'DUPLICATE' }> {
    if (this.processedWebhooksCache.has(params.event.event_id)) {
      this.inFlightWebhooks.delete(params.event.event_id);
      return { status: 'DUPLICATE' };
    }

    try {
      return await this.db.transaction(async (tx) => {
        const existing = await tx
          .select({ eventId: schema.webhookEvents.eventId })
          .from(schema.webhookEvents)
          .where(eq(schema.webhookEvents.eventId, params.event.event_id))
          .limit(1);

        if (existing[0]) {
          this.processedWebhooksCache.add(params.event.event_id);
          this.inFlightWebhooks.delete(params.event.event_id);
          return { status: 'DUPLICATE' };
        }

        await tx.insert(schema.webhookEvents).values({
          eventId: params.event.event_id,
          provider: params.event.provider,
          eventName: params.event.event_name,
          userId: params.event.user_id,
          findingId: params.event.finding_id,
          orderId: params.event.order_id,
          processedAt: params.event.processed_at,
        });

        await tx
          .insert(schema.entitlements)
          .values({
            id: params.entitlement.id,
            userId: params.entitlement.user_id,
            findingId: params.entitlement.finding_id,
            type: params.entitlement.type,
            status: params.entitlement.status,
            provider: params.entitlement.provider,
            providerTransactionId: params.entitlement.provider_transaction_id,
            amountUsd: params.entitlement.amount_usd,
            createdAt: params.entitlement.created_at,
            updatedAt: params.entitlement.updated_at,
          })
          .onConflictDoUpdate({
            target: [schema.entitlements.userId, schema.entitlements.findingId],
            set: {
              status: params.entitlement.status,
              provider: params.entitlement.provider,
              providerTransactionId: params.entitlement.provider_transaction_id,
              amountUsd: params.entitlement.amount_usd,
              updatedAt: params.entitlement.updated_at,
            },
          });

        this.processedWebhooksCache.add(params.event.event_id);
        this.inFlightWebhooks.delete(params.event.event_id);
        return { status: 'SUCCESS' };
      });
    } catch (err: any) {
      // Release in-flight lock immediately so future retries are never blocked
      this.inFlightWebhooks.delete(params.event.event_id);

      const isLockCollision =
        err?.code === 'SQLITE_BUSY' ||
        String(err?.message || '').includes('locked') ||
        String(err?.cause?.message || '').includes('locked');

      // If the error was a lock collision, allow the winning concurrent transaction a brief window to commit
      if (isLockCollision) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // Verify if another concurrent transaction committed this specific event_id
      try {
        const committed = await this.db
          .select({ eventId: schema.webhookEvents.eventId })
          .from(schema.webhookEvents)
          .where(eq(schema.webhookEvents.eventId, params.event.event_id))
          .limit(1);

        if (committed[0]) {
          // Confirmed: another transaction successfully committed this event_id
          this.processedWebhooksCache.add(params.event.event_id);
          return { status: 'DUPLICATE' };
        }
      } catch {
        // Ignore fallback query failure and proceed to throw original transaction error
      }

      // If the event was NOT committed in the database, this is NOT a duplicate.
      // Cache must NOT be poisoned with uncommitted events.
      this.processedWebhooksCache.delete(params.event.event_id);
      throw err;
    }
  }
}
