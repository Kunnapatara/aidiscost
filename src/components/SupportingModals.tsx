/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck, Mail } from 'lucide-react';

/**
 * Supporting State A: /auth
 */
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (email: string) => void;
  currentEmail?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticate,
  currentEmail,
}) => {
  const [email, setEmail] = useState(currentEmail || 'kunnapatara@gmail.com');
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    onAuthenticate(email);
    setSubmitted(true);
    setTimeout(() => {
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center mb-3">
          <Mail className="w-5 h-5" />
        </div>

        <h3 className="text-lg font-bold text-slate-900">Account &amp; History Access</h3>
        <p className="text-xs text-slate-500 mt-1 mb-5 leading-relaxed">
          Zero-friction access for purchased Optimization Fix Packages and saved verification audits.
        </p>

        {submitted ? (
          <div className="p-4 rounded-xl bg-emerald-50 text-emerald-900 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Authenticated as {email}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Work Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="eng-lead@company.com"
                className="w-full text-xs p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              Sign In with Magic Link
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

/**
 * Supporting State B: /billing/result
 */
interface BillingResultModalProps {
  isOpen: boolean;
  status: 'success' | 'cancelled' | 'error';
  findingId?: string;
  onReturnToFinding: (findingId?: string) => void;
  onClose: () => void;
}

export const BillingResultModal: React.FC<BillingResultModalProps> = ({
  isOpen,
  status,
  findingId,
  onReturnToFinding,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 text-center">
        {status === 'success' ? (
          <>
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Optimization Fix Package Unlocked</h3>
            <p className="text-xs text-slate-600 mt-1 mb-5">
              Test Entitlement Verified ($49.00). Idempotency token registered.
            </p>
            <button
              type="button"
              onClick={() => onReturnToFinding(findingId)}
              className="w-full py-2.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              View Unlocked Fix Package
            </button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 mx-auto flex items-center justify-center mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Checkout Cancelled</h3>
            <p className="text-xs text-slate-600 mt-1 mb-5">
              No charges were made to your account. You can return to the evidence finding at any time.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              Return to Finding
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Supporting State C: /error (Explicit Diagnostics)
 */
export type ErrorCategory =
  | 'SOURCE_ERROR'
  | 'PARSING_ERROR'
  | 'NORMALIZATION_ERROR'
  | 'PRICING_ERROR'
  | 'RULE_ERROR'
  | 'PERSISTENCE_ERROR'
  | 'BILLING_ERROR'
  | 'UNKNOWN_ERROR';

interface ErrorViewProps {
  category: ErrorCategory;
  message: string;
  technicalDetails?: string;
  onRetry: () => void;
  onBackToConnect: () => void;
}

export const ErrorView: React.FC<ErrorViewProps> = ({
  category,
  message,
  technicalDetails,
  onRetry,
  onBackToConnect,
}) => {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-6">
      <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-700 mx-auto flex items-center justify-center">
        <AlertTriangle className="w-7 h-7" />
      </div>

      <div>
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
          {category}
        </span>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight mt-2">
          Diagnostic Audit Exception
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-md mx-auto leading-relaxed">
          {message}
        </p>
      </div>

      {technicalDetails && (
        <div className="p-4 rounded-xl bg-slate-900 text-slate-200 text-left font-mono text-xs overflow-x-auto">
          {technicalDetails}
        </div>
      )}

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-800 text-xs font-bold hover:bg-slate-50 transition-colors"
        >
          Try Again
        </button>
        <button
          type="button"
          onClick={onBackToConnect}
          className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
        >
          Connect Different Source
        </button>
      </div>
    </div>
  );
};
