/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { ServerStorage } from './storage';
import {
  AuthenticatedRequest,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  getSessionCookieOptions,
  requireAuth,
} from './auth';
import {
  getLemonSqueezyConfig,
  verifyLemonSqueezySignature,
  createLemonSqueezyCheckout,
} from './lemon-squeezy';
import { User, Entitlement } from './types';

export function createApiRouter(): Router {
  const router = Router();
  const isProduction = process.env.NODE_ENV === 'production';

  // ==========================================
  // AUTHENTICATION ENDPOINTS
  // ==========================================

  // POST /api/auth/register
  router.post('/auth/register', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body || {};

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'INVALID_EMAIL', message: 'A valid email address is required.' });
        return;
      }

      if (!password || typeof password !== 'string' || password.length < 6) {
        res.status(400).json({
          error: 'WEAK_PASSWORD',
          message: 'Password must be at least 6 characters long.',
        });
        return;
      }

      const storage = ServerStorage.getInstance();
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        res.status(409).json({ error: 'USER_EXISTS', message: 'A user with this email already exists.' });
        return;
      }

      const now = new Date().toISOString();
      const user: User = {
        id: `usr_${crypto.randomUUID()}`,
        email: email.trim().toLowerCase(),
        password_hash: hashPassword(password),
        created_at: now,
        updated_at: now,
      };

      await storage.createUser(user);

      // Create session
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
      await storage.createSession({
        token,
        user_id: user.id,
        expires_at: expiresAt,
        created_at: now,
      });

      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(isProduction));

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        },
      });
    } catch (err) {
      console.error('[API] Register error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create account.' });
    }
  });

  // POST /api/auth/login
  router.post('/auth/login', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        res.status(400).json({ error: 'MISSING_CREDENTIALS', message: 'Email and password are required.' });
        return;
      }

      const storage = ServerStorage.getInstance();
      const user = await storage.getUserByEmail(email);
      if (!user) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
        return;
      }

      const isValid = verifyPassword(password, user.password_hash);
      if (!isValid) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
        return;
      }

      const now = new Date().toISOString();
      const token = generateSessionToken();
      const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

      await storage.createSession({
        token,
        user_id: user.id,
        expires_at: expiresAt,
        created_at: now,
      });

      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions(isProduction));

      res.json({
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        },
      });
    } catch (err) {
      console.error('[API] Login error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Login failed.' });
    }
  });

  // POST /api/auth/logout
  router.post('/auth/logout', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const token = req.cookies?.[SESSION_COOKIE_NAME] || req.sessionToken;
      if (token) {
        const storage = ServerStorage.getInstance();
        await storage.deleteSession(token);
      }
      res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
      res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Logout error.' });
    }
  });

  // GET /api/auth/me
  router.get('/auth/me', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
      res.json({ authenticated: false, user: null });
      return;
    }
    res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        created_at: req.user.created_at,
      },
    });
  });

  // ==========================================
  // FINDINGS & OWNERSHIP ENDPOINTS
  // ==========================================

  // POST /api/findings/register
  // Associates an array of finding IDs from an audit with the authenticated user
  router.post('/findings/register', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { finding_ids } = req.body || {};
      if (!Array.isArray(finding_ids) || finding_ids.length === 0) {
        res.status(400).json({ error: 'INVALID_FINDINGS', message: 'Array of finding_ids is required.' });
        return;
      }

      const storage = ServerStorage.getInstance();
      const user = req.user!;
      const registered: string[] = [];

      for (const findingId of finding_ids) {
        if (typeof findingId === 'string' && findingId.trim()) {
          const owner = await storage.getFindingOwner(findingId);
          if (!owner) {
            await storage.registerFindingOwnership(findingId, user.id);
            registered.push(findingId);
          } else if (owner === user.id) {
            registered.push(findingId);
          }
        }
      }

      res.json({ success: true, user_id: user.id, registered_count: registered.length });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to register findings.' });
    }
  });

  // GET /api/findings/:id/entitlement
  // Returns whether the authenticated user has paid entitlement for this finding
  router.get('/findings/:id/entitlement', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const findingId = req.params.id;
      const user = req.user!;
      const storage = ServerStorage.getInstance();

      const ownerId = await storage.getFindingOwner(findingId);
      // Privacy boundary: If finding does not belong to user, return 404 to avoid leaking existence
      if (ownerId && ownerId !== user.id) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Finding not found.' });
        return;
      }

      const hasPaid = await storage.hasActivePaidEntitlement(user.id, findingId);
      const entitlement = await storage.getEntitlement(user.id, findingId);

      res.json({
        finding_id: findingId,
        user_id: user.id,
        is_paid: hasPaid,
        entitlement_type: hasPaid ? 'PAID_FIX_PACKAGE' : 'LOCKED',
        entitlement: hasPaid ? entitlement : null,
      });
    } catch (err) {
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to retrieve entitlement.' });
    }
  });

  // ==========================================
  // BILLING & CHECKOUT ENDPOINTS
  // ==========================================

  // POST /api/billing/fix-package/checkout
  router.post('/billing/fix-package/checkout', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { finding_id, redirect_url } = req.body || {};
      if (!finding_id || typeof finding_id !== 'string') {
        res.status(400).json({ error: 'INVALID_FINDING', message: 'finding_id is required.' });
        return;
      }

      const user = req.user!;
      const storage = ServerStorage.getInstance();

      // Check ownership
      const ownerId = await storage.getFindingOwner(finding_id);
      if (ownerId && ownerId !== user.id) {
        // Do not leak existence of another user's finding
        res.status(404).json({ error: 'NOT_FOUND', message: 'Finding not found.' });
        return;
      }

      // Automatically register ownership if not registered yet
      if (!ownerId) {
        await storage.registerFindingOwnership(finding_id, user.id);
      }

      // Check if already entitled
      const alreadyPaid = await storage.hasActivePaidEntitlement(user.id, finding_id);
      if (alreadyPaid) {
        res.status(409).json({
          error: 'ALREADY_ENTITLED',
          message: 'This finding already has an active Fix Package entitlement.',
        });
        return;
      }

      // Check configuration
      const config = getLemonSqueezyConfig();
      if (!config.isConfigured) {
        res.status(503).json({
          error: 'BILLING_NOT_CONFIGURED',
          message: 'Fix Package checkout is not currently available.',
        });
        return;
      }

      // Initiate real checkout with Lemon Squeezy API
      const result = await createLemonSqueezyCheckout({
        userId: user.id,
        userEmail: user.email,
        findingId: finding_id,
        redirectUrl: redirect_url,
      });

      res.json({
        success: true,
        checkout_url: result.checkoutUrl,
        finding_id,
        amount_usd: 49.0,
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'BILLING_NOT_CONFIGURED') {
        res.status(503).json({
          error: 'BILLING_NOT_CONFIGURED',
          message: 'Fix Package checkout is not currently available.',
        });
        return;
      }
      console.error('[API] Checkout error:', err);
      res.status(500).json({ error: 'CHECKOUT_FAILED', message: 'Unable to initiate checkout session.' });
    }
  });

  // ==========================================
  // WEBHOOK ENDPOINT
  // ==========================================

  // POST /api/webhooks/lemon-squeezy
  router.post('/webhooks/lemon-squeezy', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const config = getLemonSqueezyConfig();
      const secret = config.webhookSecret;

      if (!secret) {
        res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook secret is not configured.' });
        return;
      }

      const signature = req.headers['x-signature'] as string | undefined;
      const rawBody = req.rawBody || JSON.stringify(req.body);

      // 1. Signature Verification
      const isValidSignature = verifyLemonSqueezySignature(rawBody, signature, secret);
      if (!isValidSignature) {
        res.status(401).json({ error: 'INVALID_SIGNATURE', message: 'Webhook signature verification failed.' });
        return;
      }

      const payload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString('utf-8'));
      const eventName = payload?.meta?.event_name;
      const eventId = String(payload?.meta?.event_id || payload?.data?.id || '');

      if (!eventName || !eventId) {
        res.status(400).json({ error: 'MALFORMED_WEBHOOK', message: 'Missing event metadata.' });
        return;
      }

      const storage = ServerStorage.getInstance();

      // 2. Idempotency Check
      const alreadyProcessed = await storage.isWebhookEventProcessed(eventId);
      if (alreadyProcessed) {
        res.status(200).json({
          status: 'IDEMPOTENT_DUPLICATE',
          message: 'Event has already been processed.',
        });
        return;
      }

      // We handle 'order_created' for payment capture
      if (eventName === 'order_created') {
        const orderData = payload?.data;
        const attributes = orderData?.attributes;
        const customData = payload?.meta?.custom_data || attributes?.first_order_item?.custom;

        const userId = customData?.user_id;
        const findingId = customData?.finding_id;
        const orderStatus = attributes?.status;
        const orderId = String(orderData?.id || attributes?.identifier || eventId);

        // Variant validation if variant ID is configured
        if (config.variantId) {
          const incomingVariantId = String(attributes?.first_order_item?.variant_id || '');
          if (incomingVariantId && incomingVariantId !== config.variantId) {
            res.status(400).json({
              error: 'WRONG_VARIANT',
              message: `Variant ID ${incomingVariantId} does not match configured Fix Package variant.`,
            });
            return;
          }
        }

        // Only paid status creates entitlement
        if (orderStatus !== 'paid') {
          await storage.recordProcessedWebhook({
            event_id: eventId,
            provider: 'LEMON_SQUEEZY',
            event_name: eventName,
            processed_at: new Date().toISOString(),
          });
          res.status(200).json({ status: 'IGNORED_NON_PAID', order_status: orderStatus });
          return;
        }

        if (!userId || !findingId) {
          res.status(400).json({
            error: 'MISSING_CUSTOM_DATA',
            message: 'Webhook custom_data must contain user_id and finding_id.',
          });
          return;
        }

        // Verify user exists
        const user = await storage.getUserById(userId);
        if (!user) {
          res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User does not exist.' });
          return;
        }

        // Create authoritative finding-scoped entitlement
        const now = new Date().toISOString();
        const entitlement: Entitlement = {
          id: `ent_${crypto.randomUUID()}`,
          user_id: userId,
          finding_id: findingId,
          type: 'PAID_FIX_PACKAGE',
          status: 'ACTIVE',
          provider: 'LEMON_SQUEEZY',
          provider_transaction_id: orderId,
          amount_usd: 49.0,
          created_at: now,
          updated_at: now,
        };

        await storage.createEntitlement(entitlement);

        // Record event for idempotency
        await storage.recordProcessedWebhook({
          event_id: eventId,
          provider: 'LEMON_SQUEEZY',
          event_name: eventName,
          user_id: userId,
          finding_id: findingId,
          order_id: orderId,
          processed_at: now,
        });

        res.status(200).json({
          status: 'SUCCESS',
          entitlement_id: entitlement.id,
          finding_id: entitlement.finding_id,
        });
        return;
      }

      // For other events, record as processed and return 200
      await storage.recordProcessedWebhook({
        event_id: eventId,
        provider: 'LEMON_SQUEEZY',
        event_name: eventName,
        processed_at: new Date().toISOString(),
      });

      res.status(200).json({ status: 'IGNORED_EVENT', event_name: eventName });
    } catch (err) {
      console.error('[API] Webhook error:', err);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to process webhook.' });
    }
  });

  return router;
}
