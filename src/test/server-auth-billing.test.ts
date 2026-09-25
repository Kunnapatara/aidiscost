/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { ServerStorage } from '../server/storage';
import { hashPassword, verifyPassword, generateSessionToken, authenticate } from '../server/auth';
import { verifyLemonSqueezySignature } from '../server/lemon-squeezy';
import { createApiRouter } from '../server/api';

describe('AIDisCost Server — Auth, Entitlement & Billing Tests', () => {
  let server: http.Server;
  let serverUrl: string;
  const storage = ServerStorage.getInstance('data', 'test-db.json');

  before(async () => {
    storage.setTestMode(true);
    storage.clearAll();

    // Create test express app
    const app = express();
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      })
    );
    app.use(cookieParser());
    app.use(authenticate);
    app.use('/api', createApiRouter());

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    storage.clearAll();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('Cryptographic Password & Session Security', () => {
    test('hashes password using PBKDF2 with salt', () => {
      const password = 'StrongPassword123!';
      const hash = hashPassword(password);
      assert.ok(hash.includes(':'), 'Hash must contain salt delimiter');
      assert.strictEqual(verifyPassword(password, hash), true);
      assert.strictEqual(verifyPassword('WrongPassword', hash), false);
    });

    test('generates cryptographically secure session tokens', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();
      assert.strictEqual(token1.length, 64, 'Token must be 32 bytes hex (64 chars)');
      assert.notStrictEqual(token1, token2);
    });

    test('verifies Lemon Squeezy HMAC SHA256 signature correctly', () => {
      const secret = 'test_webhook_secret_key_12345';
      const body = JSON.stringify({ event: 'order_created', data: { id: 'ord_123' } });

      const validSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');
      assert.strictEqual(verifyLemonSqueezySignature(body, validSignature, secret), true);

      // Rejects tampered signature
      const tamperedSignature = crypto.createHmac('sha256', secret).update(body + 'tamper').digest('hex');
      assert.strictEqual(verifyLemonSqueezySignature(body, tamperedSignature, secret), false);

      // Rejects missing or empty signature
      assert.strictEqual(verifyLemonSqueezySignature(body, '', secret), false);
      assert.strictEqual(verifyLemonSqueezySignature(body, undefined, secret), false);
    });
  });

  describe('Auth Endpoints & Session Management', () => {
    let sessionCookie: string;
    const testEmail = 'eng-lead@acmecorp.internal';
    const testPassword = 'SecurePassword987!';

    test('rejects registration with invalid email or weak password', async () => {
      // Invalid email
      const res1 = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'notanemail', password: testPassword }),
      });
      assert.strictEqual(res1.status, 400);

      // Weak password (< 6 chars)
      const res2 = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: '123' }),
      });
      assert.strictEqual(res2.status, 400);
    });

    test('registers a new user and sets HttpOnly session cookie', async () => {
      const res = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });

      assert.strictEqual(res.status, 201);
      const json: any = await res.json();
      assert.ok(json.user?.id);
      assert.strictEqual(json.user?.email, testEmail);

      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie, 'Must set cookie');
      assert.ok(setCookie.includes('aidiscost_session='));
      sessionCookie = setCookie.split(';')[0];
    });

    test('rejects duplicate registration with 409 Conflict', async () => {
      const res = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });
      assert.strictEqual(res.status, 409);
    });

    test('GET /api/auth/me verifies session token and returns user profile', async () => {
      // With valid session cookie
      const res1 = await fetch(`${serverUrl}/api/auth/me`, {
        headers: { Cookie: sessionCookie },
      });
      assert.strictEqual(res1.status, 200);
      const data1: any = await res1.json();
      assert.strictEqual(data1.authenticated, true);
      assert.strictEqual(data1.user?.email, testEmail);

      // Without cookie
      const res2 = await fetch(`${serverUrl}/api/auth/me`);
      assert.strictEqual(res2.status, 200);
      const data2: any = await res2.json();
      assert.strictEqual(data2.authenticated, false);
      assert.strictEqual(data2.user, null);
    });

    test('POST /api/auth/login authenticates registered user and issues cookie', async () => {
      // Bad password
      const resBad = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: 'WrongPassword!' }),
      });
      assert.strictEqual(resBad.status, 401);

      // Correct credentials
      const resOk = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });
      assert.strictEqual(resOk.status, 200);
      const data: any = await resOk.json();
      assert.strictEqual(data.user?.email, testEmail);
    });
  });

  describe('Finding Ownership & Privacy Boundaries', () => {
    let userCookie: string;
    let otherUserCookie: string;
    const testFindingId = 'fnd_test_retry_storm_001';

    before(async () => {
      // Create user 1
      const res1 = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user1@company.com', password: 'Password123!' }),
      });
      userCookie = res1.headers.get('set-cookie')!.split(';')[0];

      // Create user 2
      const res2 = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user2@company.com', password: 'Password123!' }),
      });
      otherUserCookie = res2.headers.get('set-cookie')!.split(';')[0];
    });

    test('unauthenticated calls to protected routes return 401 UNAUTHORIZED', async () => {
      const res = await fetch(`${serverUrl}/api/findings/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finding_ids: [testFindingId] }),
      });
      assert.strictEqual(res.status, 401);
    });

    test('registers finding ownership to authenticated user', async () => {
      const res = await fetch(`${serverUrl}/api/findings/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: userCookie,
        },
        body: JSON.stringify({ finding_ids: [testFindingId] }),
      });
      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.registered_count, 1);
    });

    test('finding owner can query initial locked entitlement status', async () => {
      const res = await fetch(`${serverUrl}/api/findings/${testFindingId}/entitlement`, {
        headers: { Cookie: userCookie },
      });
      assert.strictEqual(res.status, 200);
      const data: any = await res.json();
      assert.strictEqual(data.is_paid, false);
      assert.strictEqual(data.entitlement_type, 'LOCKED');
    });

    test('privacy boundary: another user receives 404 for findings owned by user 1', async () => {
      const res = await fetch(`${serverUrl}/api/findings/${testFindingId}/entitlement`, {
        headers: { Cookie: otherUserCookie },
      });
      assert.strictEqual(res.status, 404, 'Must return 404 to avoid leaking existence of another user finding');
    });
  });

  describe('Lemon Squeezy Webhook & Entitlement Activation', () => {
    const webhookSecret = 'test_ls_secret_777';
    let findingOwnerId: string;
    const findingToUnlock = 'fnd_model_rightsizing_premium_01';

    before(async () => {
      process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = webhookSecret;

      // Register owner
      const res = await fetch(`${serverUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'finance-lead@corp.net', password: 'Password123!' }),
      });
      const data: any = await res.json();
      findingOwnerId = data.user.id;
      const cookie = res.headers.get('set-cookie')!.split(';')[0];

      // Register finding
      await fetch(`${serverUrl}/api/findings/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({ finding_ids: [findingToUnlock] }),
      });
    });

    test('rejects webhook without valid HMAC signature', async () => {
      const body = JSON.stringify({ meta: { event_name: 'order_created', event_id: 'evt_1' } });
      const res = await fetch(`${serverUrl}/api/webhooks/lemon-squeezy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': 'invalid_signature_hex',
        },
        body,
      });
      assert.strictEqual(res.status, 401);
    });

    test('processes order_created webhook and activates authoritative entitlement', async () => {
      const eventId = `ls_evt_${Date.now()}`;
      const payload = {
        meta: {
          event_name: 'order_created',
          event_id: eventId,
          custom_data: {
            user_id: findingOwnerId,
            finding_id: findingToUnlock,
            product: 'FIX_PACKAGE',
          },
        },
        data: {
          id: 'order_ls_99901',
          attributes: {
            status: 'paid',
            identifier: 'ord_ident_001',
          },
        },
      };

      const bodyString = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', webhookSecret).update(bodyString).digest('hex');

      const res = await fetch(`${serverUrl}/api/webhooks/lemon-squeezy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': signature,
        },
        body: bodyString,
      });

      assert.strictEqual(res.status, 200);
      const result: any = await res.json();
      assert.strictEqual(result.status, 'SUCCESS');
      assert.strictEqual(result.finding_id, findingToUnlock);

      // Verify entitlement exists in storage
      const hasEntitlement = await storage.hasActivePaidEntitlement(findingOwnerId, findingToUnlock);
      assert.strictEqual(hasEntitlement, true);

      // Verify idempotent deduplication: sending the same event again returns duplicate status
      const resDupe = await fetch(`${serverUrl}/api/webhooks/lemon-squeezy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': signature,
        },
        body: bodyString,
      });

      assert.strictEqual(resDupe.status, 200);
      const dupeJson: any = await resDupe.json();
      assert.strictEqual(dupeJson.status, 'IDEMPOTENT_DUPLICATE');
    });
  });
});
