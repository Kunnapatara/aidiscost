/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { LemonSqueezyConfig } from './types';

export function getLemonSqueezyConfig(): LemonSqueezyConfig {
  const apiKey = (process.env.LEMON_SQUEEZY_API_KEY || '').trim();
  const storeId = (process.env.LEMON_SQUEEZY_STORE_ID || '').trim();
  const variantId = (process.env.LEMON_SQUEEZY_VARIANT_ID || '').trim();
  const webhookSecret = (process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || '').trim();

  const isConfigured = Boolean(apiKey && storeId && variantId && webhookSecret);

  return {
    apiKey,
    storeId,
    variantId,
    webhookSecret,
    isConfigured,
  };
}

/**
 * Verifies the Lemon Squeezy HMAC SHA256 webhook signature.
 * Prevents timing attacks via timingSafeEqual.
 */
export function verifyLemonSqueezySignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', secret);
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf-8');
    const digest = hmac.update(bodyBuffer).digest('hex');

    const expectedBuffer = Buffer.from(digest, 'hex');
    const actualBuffer = Buffer.from(signatureHeader, 'hex');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}

export interface CreateCheckoutParams {
  userId: string;
  userEmail: string;
  findingId: string;
  redirectUrl?: string;
}

export interface CreateCheckoutResult {
  checkoutUrl: string;
}

/**
 * Creates a real Lemon Squeezy checkout session for the $49 Fix Package.
 * The price is locked server-side via LEMON_SQUEEZY_VARIANT_ID; the client CANNOT override it.
 */
export async function createLemonSqueezyCheckout(
  params: CreateCheckoutParams,
  configOverride?: Partial<LemonSqueezyConfig>
): Promise<CreateCheckoutResult> {
  const config = { ...getLemonSqueezyConfig(), ...configOverride };

  if (!config.isConfigured && (!config.apiKey || !config.storeId || !config.variantId)) {
    throw new Error('BILLING_NOT_CONFIGURED');
  }

  const payload = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: params.userEmail,
          custom: {
            user_id: params.userId,
            finding_id: params.findingId,
            product: 'FIX_PACKAGE',
          },
        },
        product_options: {
          redirect_url: params.redirectUrl || undefined,
        },
      },
      relationships: {
        store: {
          data: {
            type: 'stores',
            id: String(config.storeId),
          },
        },
        variant: {
          data: {
            type: 'variants',
            id: String(config.variantId),
          },
        },
      },
    },
  };

  const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Lemon Squeezy API checkout failed (${response.status}): ${errorBody}`);
  }

  const json: any = await response.json();
  const url = json?.data?.attributes?.url;
  if (!url) {
    throw new Error('Lemon Squeezy did not return a valid checkout URL');
  }

  return { checkoutUrl: url };
}
