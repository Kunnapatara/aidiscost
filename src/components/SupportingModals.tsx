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
  const [email, setEmail] = useState(currentEmail || '');
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

        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            SSO Adapter Ready &bull; Standalone Mode
          </span>
        </div>
        <h3 className="text-lg font-bold text-slate-900">Workspace &amp; Identity Configuration</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed">
          AIDisCost parses telemetry client-side with zero remote exfiltration. Standalone audits, data health,
          and verification do not require cloud account authentication.
        </p>

        {submitted ? (
          <div className="p-4 rounded-xl bg-emerald-50 text-emerald-900 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Local Session Contact: {email} (Identity Provider Not Connected)</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Team Contact Email (Optional)</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="eng-team@company.com"
                className="w-full text-xs p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Used locally for export metadata and audit session identification.
              </span>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
            >
              Save Local Session Contact
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
            <div className="inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-100 text-amber-900 border border-amber-300 mb-2">
              Preview Mode &bull; Adapter Ready
            </div>
            <h3 className="text-lg font-bold text-slate-900">Optimization Fix Package Unlocked</h3>
            <p className="text-xs text-slate-600 mt-1 mb-5 leading-relaxed">
              Commercial Contract: $49 one-time per finding. In this standalone MVP preview, no live credit card
              was charged. Root cause analysis, canary harness config, acceptance criteria, and rollback protocol are now accessible.
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
            <h3 className="text-lg font-bold text-slate-900">Action Cancelled</h3>
            <p className="text-xs text-slate-600 mt-1 mb-5 leading-relaxed">
              No changes or charges were made. You can return to the evidence finding at any time.
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
