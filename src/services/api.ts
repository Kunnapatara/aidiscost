/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthoritativeVerification, VerificationState } from '../types/domain';

export interface AuthUser {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user: AuthUser | null;
}

export interface EntitlementResponse {
  finding_id: string;
  user_id: string;
  is_paid: boolean;
  entitlement_type: 'PAID_FIX_PACKAGE' | 'LOCKED';
  entitlement?: any;
}

export interface CheckoutResponse {
  success: boolean;
  checkout_url?: string;
  finding_id?: string;
  amount_usd?: number;
  error?: string;
  message?: string;
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return { authenticated: false, user: null };
    return await res.json();
  } catch {
    return { authenticated: false, user: null };
  }
}

export async function registerUser(email: string, password: string): Promise<{ user?: AuthUser; error?: string; message?: string }> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error || 'REGISTRATION_FAILED', message: data.message || 'Registration failed.' };
    }
    return { user: data.user };
  } catch (err) {
    return { error: 'NETWORK_ERROR', message: (err as Error).message };
  }
}

export async function loginUser(email: string, password: string): Promise<{ user?: AuthUser; error?: string; message?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error || 'LOGIN_FAILED', message: data.message || 'Login failed.' };
    }
    return { user: data.user };
  } catch (err) {
    return { error: 'NETWORK_ERROR', message: (err as Error).message };
  }
}

export async function logoutUser(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function registerFindings(findingIds: string[]): Promise<boolean> {
  try {
    const res = await fetch('/api/findings/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finding_ids: findingIds }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getFindingEntitlement(findingId: string): Promise<EntitlementResponse | null> {
  try {
    const res = await fetch(`/api/findings/${encodeURIComponent(findingId)}/entitlement`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function createFixPackageCheckout(
  findingId: string,
  redirectUrl?: string
): Promise<CheckoutResponse> {
  try {
    const res = await fetch('/api/billing/fix-package/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        finding_id: findingId,
        redirect_url: redirectUrl,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'CHECKOUT_ERROR',
        message: data.message || 'Fix Package checkout is not currently available.',
      };
    }
    return data;
  } catch (err) {
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: 'Unable to reach payment server. Please try again.',
    };
  }
}

export interface VerificationApiResponse {
  finding_id: string;
  verification: AuthoritativeVerification | null;
  stage: string;
  is_authoritative: boolean;
  is_simulated?: boolean;
  verified_annualized_savings_usd: number;
  evaluated_state?: VerificationState;
}

export async function getFindingVerification(findingId: string): Promise<VerificationApiResponse | null> {
  try {
    const res = await fetch(`/api/findings/${encodeURIComponent(findingId)}/verification`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function recordFindingDeployment(
  findingId: string,
  baseline: {
    start: string;
    end: string;
    sample_count: number;
    avg_cost_per_call_usd: number;
  },
  isSampleData?: boolean
): Promise<VerificationApiResponse | null> {
  try {
    const res = await fetch(`/api/findings/${encodeURIComponent(findingId)}/verification/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseline, is_sample_data: isSampleData }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function evaluateFindingVerification(
  findingId: string,
  events: any[],
  finding: any,
  fileName?: string
): Promise<VerificationApiResponse | null> {
  try {
    const res = await fetch(`/api/findings/${encodeURIComponent(findingId)}/verification/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, finding, file_name: fileName }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

