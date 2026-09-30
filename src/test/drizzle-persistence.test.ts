/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { createDatabaseConnection, initializeDatabaseSchema } from '../server/db/index';
import { DrizzleStorageAdapter } from '../server/db/adapter';
import { migrateJsonToSql } from '../server/db/migrate-json';
import * as schema from '../server/db/schema';
import { User, UserSession, FindingOwnership, Entitlement, ProcessedWebhookEvent } from '../server/types';

describe('Turso/libSQL & Drizzle Persistence Test Suite', () => {
  let db: any;
  let client: any;
  let adapter: DrizzleStorageAdapter;

  beforeEach(async () => {
    const conn = createDatabaseConnection({ url: ':memory:' });
    db = conn.db;
    client = conn.client;
    await initializeDatabaseSchema(client);
    adapter = new DrizzleStorageAdapter(db, client);
  });

  afterEach(async () => {
    if (client) {
      client.close();
    }
  });

  describe('Database Schema & Constraints', () => {
    test('enforces user email uniqueness at database level', async () => {
      const user1: User = {
        id: 'usr_1',
        email: 'dev@aidiscost.io',
        password_hash: 'salt:hash1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user1);

      const user2: User = {
        id: 'usr_2',
        email: 'DEV@aidiscost.io', // case-insensitive duplicate
        password_hash: 'salt:hash2',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await assert.rejects(
        async () => {
          await adapter.createUser(user2);
        },
        /already exists/
      );
    });

    test('enforces finding ownership uniqueness (primary key) at database level', async () => {
      const user: User = {
        id: 'usr_owner_1',
        email: 'owner1@aidiscost.io',
        password_hash: 'salt:hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      const ownership1 = await adapter.registerFindingOwnership('fnd_unique_01', user.id);
      assert.strictEqual(ownership1.owner_id, user.id);

      // Attempting to register by another user returns the existing owner
      const ownership2 = await adapter.registerFindingOwnership('fnd_unique_01', 'usr_other');
      assert.strictEqual(ownership2.owner_id, user.id, 'Original owner must be preserved');
    });

    test('enforces composite uniqueness on entitlements (user_id, finding_id)', async () => {
      const user: User = {
        id: 'usr_ent_1',
        email: 'ent1@aidiscost.io',
        password_hash: 'salt:hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      const ent1: Entitlement = {
        id: 'ent_1',
        user_id: user.id,
        finding_id: 'fnd_ent_01',
        type: 'PAID_FIX_PACKAGE',
        status: 'ACTIVE',
        provider: 'LEMON_SQUEEZY',
        provider_transaction_id: 'order_1',
        amount_usd: 49.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createEntitlement(ent1);

      // Updating with new order ID preserves natural uniqueness
      const ent2: Entitlement = {
        id: 'ent_2',
        user_id: user.id,
        finding_id: 'fnd_ent_01',
        type: 'PAID_FIX_PACKAGE',
        status: 'ACTIVE',
        provider: 'LEMON_SQUEEZY',
        provider_transaction_id: 'order_2_retry',
        amount_usd: 49.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createEntitlement(ent2);

      const rows = await db.select().from(schema.entitlements);
      assert.strictEqual(rows.length, 1, 'Must contain exactly 1 entitlement row for user+finding');
      assert.strictEqual(rows[0].providerTransactionId, 'order_2_retry');
    });
  });

  describe('Storage CRUD & Session Operations', () => {
    test('user creation and lookup by ID and email', async () => {
      const user: User = {
        id: 'usr_lookup_1',
        email: 'test@aidiscost.io',
        password_hash: 'salt:hash123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      const byEmail = await adapter.getUserByEmail('test@aidiscost.io');
      assert.ok(byEmail);
      assert.strictEqual(byEmail?.id, 'usr_lookup_1');

      const byId = await adapter.getUserById('usr_lookup_1');
      assert.ok(byId);
      assert.strictEqual(byId?.email, 'test@aidiscost.io');
    });

    test('session creation, retrieval, and expiration purge', async () => {
      const user: User = {
        id: 'usr_session_1',
        email: 'session@aidiscost.io',
        password_hash: 'salt:hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      const validToken = 'token_valid_123';
      const validSession: UserSession = {
        token: validToken,
        user_id: user.id,
        expires_at: new Date(Date.now() + 100000).toISOString(),
        created_at: new Date().toISOString(),
      };
      await adapter.createSession(validSession);

      const sessionLookup = await adapter.getSession(validToken);
      assert.ok(sessionLookup);
      assert.strictEqual(sessionLookup?.user.id, user.id);

      // Expired session
      const expiredToken = 'token_expired_123';
      const expiredSession: UserSession = {
        token: expiredToken,
        user_id: user.id,
        expires_at: new Date(Date.now() - 1000).toISOString(),
        created_at: new Date().toISOString(),
      };
      await adapter.createSession(expiredSession);

      const expiredLookup = await adapter.getSession(expiredToken);
      assert.strictEqual(expiredLookup, null, 'Expired session must return null and be purged');
    });

    test('session deletion on logout', async () => {
      const user: User = {
        id: 'usr_logout_1',
        email: 'logout@aidiscost.io',
        password_hash: 'salt:hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      const token = 'token_logout_123';
      await adapter.createSession({
        token,
        user_id: user.id,
        expires_at: new Date(Date.now() + 100000).toISOString(),
        created_at: new Date().toISOString(),
      });

      const deleted = await adapter.deleteSession(token);
      assert.strictEqual(deleted, true);

      const lookup = await adapter.getSession(token);
      assert.strictEqual(lookup, null);
    });
  });

  describe('Transactional Webhook Idempotency & Commercial Invariants', () => {
    test('transaction commits event and entitlement atomically on valid order_created', async () => {
      const user: User = {
        id: 'usr_pay_1',
        email: 'pay1@aidiscost.io',
        password_hash: 'salt:hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      const event: ProcessedWebhookEvent = {
        event_id: 'ls_evt_atom_01',
        provider: 'LEMON_SQUEEZY',
        event_name: 'order_created',
        user_id: user.id,
        finding_id: 'fnd_atom_01',
        order_id: 'order_atom_01',
        processed_at: new Date().toISOString(),
      };

      const entitlement: Entitlement = {
        id: 'ent_atom_01',
        user_id: user.id,
        finding_id: 'fnd_atom_01',
        type: 'PAID_FIX_PACKAGE',
        status: 'ACTIVE',
        provider: 'LEMON_SQUEEZY',
        provider_transaction_id: 'order_atom_01',
        amount_usd: 49.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await adapter.processOrderCreatedWebhookTransaction({ event, entitlement });
      assert.strictEqual(result.status, 'SUCCESS');

      // Verify both records exist
      const isProcessed = await adapter.isWebhookEventProcessed(event.event_id);
      assert.strictEqual(isProcessed, true);

      const hasPaid = await adapter.hasActivePaidEntitlement(user.id, 'fnd_atom_01');
      assert.strictEqual(hasPaid, true);
    });

    test('sequential duplicate webhook returns DUPLICATE and does not create second entitlement', async () => {
      const user: User = {
        id: 'usr_dup_1',
        email: 'dup1@aidiscost.io',
        password_hash: 'salt:hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      const event: ProcessedWebhookEvent = {
        event_id: 'ls_evt_seq_dup_01',
        provider: 'LEMON_SQUEEZY',
        event_name: 'order_created',
        user_id: user.id,
        finding_id: 'fnd_seq_dup_01',
        order_id: 'order_seq_dup_01',
        processed_at: new Date().toISOString(),
      };

      const entitlement: Entitlement = {
        id: 'ent_seq_dup_01',
        user_id: user.id,
        finding_id: 'fnd_seq_dup_01',
        type: 'PAID_FIX_PACKAGE',
        status: 'ACTIVE',
        provider: 'LEMON_SQUEEZY',
        provider_transaction_id: 'order_seq_dup_01',
        amount_usd: 49.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const res1 = await adapter.processOrderCreatedWebhookTransaction({ event, entitlement });
      assert.strictEqual(res1.status, 'SUCCESS');

      // Second identical request
      const res2 = await adapter.processOrderCreatedWebhookTransaction({ event, entitlement });
      assert.strictEqual(res2.status, 'DUPLICATE');

      const entRows = await db.select().from(schema.entitlements);
      assert.strictEqual(entRows.length, 1);
    });

    test('concurrent duplicate webhooks (N=5) result in exactly 1 SUCCESS and 4 DUPLICATES', async () => {
      const user: User = {
        id: 'usr_conc_1',
        email: 'concurrent@aidiscost.io',
        password_hash: 'salt:hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      const sharedEventId = `ls_evt_conc_n5_${Date.now()}`;
      const makeRequest = () => {
        const event: ProcessedWebhookEvent = {
          event_id: sharedEventId,
          provider: 'LEMON_SQUEEZY',
          event_name: 'order_created',
          user_id: user.id,
          finding_id: 'fnd_conc_n5',
          order_id: 'order_conc_n5',
          processed_at: new Date().toISOString(),
        };

        const entitlement: Entitlement = {
          id: `ent_conc_${Math.random()}`,
          user_id: user.id,
          finding_id: 'fnd_conc_n5',
          type: 'PAID_FIX_PACKAGE',
          status: 'ACTIVE',
          provider: 'LEMON_SQUEEZY',
          provider_transaction_id: 'order_conc_n5',
          amount_usd: 49.0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const claim = adapter.claimWebhookEvent(sharedEventId);
        if (claim === 'DUPLICATE' || claim === 'IN_FLIGHT') {
          return { status: 'DUPLICATE' as const };
        }

        return adapter.processOrderCreatedWebhookTransaction({ event, entitlement });
      };

      // Dispatch 5 concurrent requests
      const results = await Promise.all([
        makeRequest(),
        makeRequest(),
        makeRequest(),
        makeRequest(),
        makeRequest(),
      ]);

      const successCount = results.filter((r) => r.status === 'SUCCESS').length;
      const duplicateCount = results.filter((r) => r.status === 'DUPLICATE').length;

      assert.strictEqual(successCount, 1, 'Exactly one concurrent request must succeed');
      assert.strictEqual(duplicateCount, 4, 'Remaining concurrent requests must return DUPLICATE');

      const entRows = await db.select().from(schema.entitlements);
      assert.strictEqual(entRows.length, 1, 'Only 1 entitlement record must exist in DB');
    });

    test('transaction failure rollback leaves no partial state', async () => {
      const user: User = {
        id: 'usr_rollback_1',
        email: 'rollback@aidiscost.io',
        password_hash: 'salt:hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      const badEventId = 'ls_evt_rollback_fail_01';

      // Deliberately trigger transaction failure during transaction
      await assert.rejects(
        async () => {
          await db.transaction(async (tx: any) => {
            await tx.insert(schema.webhookEvents).values({
              eventId: badEventId,
              provider: 'LEMON_SQUEEZY',
              eventName: 'order_created',
              userId: user.id,
              findingId: 'fnd_fail',
              orderId: 'order_fail',
              processedAt: new Date().toISOString(),
            });

            // Force simulated exception
            throw new Error('Simulated transaction failure after event insert');
          });
        },
        /Simulated transaction failure/
      );

      // Verify webhook event was rolled back and is NOT in the database
      const webhookRows = await db
        .select()
        .from(schema.webhookEvents)
        .where(eq(schema.webhookEvents.eventId, badEventId));
      assert.strictEqual(webhookRows.length, 0, 'Webhook event must have been rolled back');
    });

    test('distinct events for same finding update entitlement without duplicating rows', async () => {
      const user: User = {
        id: 'usr_distinct_1',
        email: 'distinct@aidiscost.io',
        password_hash: 'salt:hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await adapter.createUser(user);

      // Event 1
      const res1 = await adapter.processOrderCreatedWebhookTransaction({
        event: {
          event_id: 'ls_evt_distinct_01',
          provider: 'LEMON_SQUEEZY',
          event_name: 'order_created',
          user_id: user.id,
          finding_id: 'fnd_distinct_01',
          order_id: 'order_101',
          processed_at: new Date().toISOString(),
        },
        entitlement: {
          id: 'ent_dist_1',
          user_id: user.id,
          finding_id: 'fnd_distinct_01',
          type: 'PAID_FIX_PACKAGE',
          status: 'ACTIVE',
          provider: 'LEMON_SQUEEZY',
          provider_transaction_id: 'order_101',
          amount_usd: 49.0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      assert.strictEqual(res1.status, 'SUCCESS');

      // Event 2 (distinct event_id for same user & finding)
      const res2 = await adapter.processOrderCreatedWebhookTransaction({
        event: {
          event_id: 'ls_evt_distinct_02',
          provider: 'LEMON_SQUEEZY',
          event_name: 'order_created',
          user_id: user.id,
          finding_id: 'fnd_distinct_01',
          order_id: 'order_102',
          processed_at: new Date().toISOString(),
        },
        entitlement: {
          id: 'ent_dist_2',
          user_id: user.id,
          finding_id: 'fnd_distinct_01',
          type: 'PAID_FIX_PACKAGE',
          status: 'ACTIVE',
          provider: 'LEMON_SQUEEZY',
          provider_transaction_id: 'order_102',
          amount_usd: 49.0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
      assert.strictEqual(res2.status, 'SUCCESS');

      const entRows = await db.select().from(schema.entitlements);
      assert.strictEqual(entRows.length, 1, 'Natural uniqueness must preserve exactly 1 entitlement row');
      assert.strictEqual(entRows[0].providerTransactionId, 'order_102');

      const eventRows = await db.select().from(schema.webhookEvents);
      assert.strictEqual(eventRows.length, 2, 'Both distinct webhook events must be recorded');
    });
  });

  describe('JSON to SQL Migration Utility', () => {
    const testJsonDir = path.resolve(process.cwd(), 'data', 'test-migration');
    const testJsonPath = path.resolve(testJsonDir, 'test-db.json');

    beforeEach(() => {
      if (!fs.existsSync(testJsonDir)) {
        fs.mkdirSync(testJsonDir, { recursive: true });
      }
    });

    afterEach(() => {
      if (fs.existsSync(testJsonDir)) {
        fs.rmSync(testJsonDir, { recursive: true, force: true });
      }
    });

    test('migrates valid JSON database with count and referential validation', async () => {
      const sampleData = {
        users: {
          'migrated@aidiscost.io': {
            id: 'usr_mig_1',
            email: 'migrated@aidiscost.io',
            password_hash: 'salt:hash',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        usersById: {
          usr_mig_1: 'migrated@aidiscost.io',
        },
        sessions: {
          token_mig_1: {
            token: 'token_mig_1',
            user_id: 'usr_mig_1',
            expires_at: new Date(Date.now() + 100000).toISOString(),
            created_at: new Date().toISOString(),
          },
        },
        findingOwnerships: {
          fnd_mig_1: {
            finding_id: 'fnd_mig_1',
            owner_id: 'usr_mig_1',
            created_at: new Date().toISOString(),
          },
        },
        entitlements: {
          'usr_mig_1:fnd_mig_1': {
            id: 'ent_mig_1',
            user_id: 'usr_mig_1',
            finding_id: 'fnd_mig_1',
            type: 'PAID_FIX_PACKAGE',
            status: 'ACTIVE',
            provider: 'LEMON_SQUEEZY',
            provider_transaction_id: 'order_mig_1',
            amount_usd: 49.0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        processedWebhooks: {
          ls_mig_evt_1: {
            event_id: 'ls_mig_evt_1',
            provider: 'LEMON_SQUEEZY',
            event_name: 'order_created',
            user_id: 'usr_mig_1',
            finding_id: 'fnd_mig_1',
            order_id: 'order_mig_1',
            processed_at: new Date().toISOString(),
          },
        },
      };

      fs.writeFileSync(testJsonPath, JSON.stringify(sampleData, null, 2), 'utf-8');

      const migrationResult = await migrateJsonToSql(db, client, testJsonPath);
      assert.strictEqual(migrationResult.success, true);
      assert.strictEqual(migrationResult.migratedCounts.users, 1);
      assert.strictEqual(migrationResult.migratedCounts.sessions, 1);
      assert.strictEqual(migrationResult.migratedCounts.findingOwnerships, 1);
      assert.strictEqual(migrationResult.migratedCounts.entitlements, 1);
      assert.strictEqual(migrationResult.migratedCounts.processedWebhooks, 1);
      assert.ok(migrationResult.backupPath && fs.existsSync(migrationResult.backupPath));
    });

    test('aborts migration cleanly and reports error on malformed JSON', async () => {
      fs.writeFileSync(testJsonPath, '{ invalid json structure ...', 'utf-8');
      const result = await migrateJsonToSql(db, client, testJsonPath);
      assert.strictEqual(result.success, false);
      assert.ok(result.validationErrors.length > 0);
    });

    test('aborts migration and fails closed if orphaned records violate referential integrity', async () => {
      const orphanedData = {
        users: {}, // No users
        sessions: {
          token_orphan: {
            token: 'token_orphan',
            user_id: 'usr_nonexistent',
            expires_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          },
        },
      };
      fs.writeFileSync(testJsonPath, JSON.stringify(orphanedData, null, 2), 'utf-8');

      const result = await migrateJsonToSql(db, client, testJsonPath);
      assert.strictEqual(result.success, false);
      assert.ok(result.validationErrors.some((e) => e.includes('orphaned user_id')));
    });
  });
});
