/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Finding, VerificationState, AIEvent } from '../types/domain';
import { MetricTile } from '../components/MetricTile';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Clock, Layers } from 'lucide-react';

interface VerifyViewProps {
  finding: Finding;
  verificationState: VerificationState;
  onDeploy: (findingId: string) => void;
  onIngestObservation: (findingId: string, count: number) => void;
  onBack: () => void;
}

export const VerifyView: React.FC<VerifyViewProps> = ({
  finding,
  verificationState,
  onDeploy,
  onIngestObservation,
  onBack,
}) => {
  const stage = verificationState.stage;
  const isBaseline = stage === 'BASELINE';
  const isObserving = stage === 'OBSERVATION_ACTIVE';
  const isVerified = stage === 'VERIFIED_RESULT';

  const stages = [
    { key: 'BASELINE', label: '1. Baseline' },
    { key: 'CUSTOMER_DEPLOYED', label: '2. Deployed' },
    { key: 'OBSERVATION_ACTIVE', label: '3. Observation Active' },
    { key: 'VERIFIED_RESULT', label: '4. Verified Result' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          id="btn-back-from-verify"
          onClick={onBack}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Finding</span>
        </button>

        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
          {finding.rule_id}
        </span>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-mono uppercase tracking-wider text-teal-700 font-semibold">
            Step 4: Empirical Post-Deployment Verification (VERIFY)
          </span>
          <ProvenanceBadge provenance={isVerified ? 'VERIFIED' : 'ESTIMATED'} size="sm" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Verify Savings: {finding.title}
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Conservative validation engine. We do not declare savings verified until sustained post-deployment
          telemetry proves unit-cost reduction across comparable production traffic.
        </p>
      </div>

      {/* 4-Stage Verification Progression Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stages.map((s, idx) => {
            const isCurrent =
              s.key === stage ||
              (stage === 'OBSERVATION_ACTIVE' && s.key === 'CUSTOMER_DEPLOYED') ||
              (stage === 'VERIFIED_RESULT' && (s.key === 'CUSTOMER_DEPLOYED' || s.key === 'OBSERVATION_ACTIVE'));

            const isPassed =
              (stage === 'OBSERVATION_ACTIVE' && (s.key === 'BASELINE' || s.key === 'CUSTOMER_DEPLOYED')) ||
              (stage === 'VERIFIED_RESULT' && s.key !== 'VERIFIED_RESULT');

            return (
              <div
                key={s.key}
                className={`p-3 rounded-xl border text-xs font-semibold transition-all ${
                  stage === s.key
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                    : isPassed
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {isPassed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : stage === s.key ? (
                    <Clock className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-slate-300" />
                  )}
                  <span className="truncate">{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Baseline Window Specifications */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Pre-Deployment Baseline Metric Window
          </h3>
          <ProvenanceBadge provenance="CALCULATED" size="sm" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block mb-1 text-[11px] font-sans">Baseline Sample Count</span>
            <span className="font-bold text-slate-900 text-sm">{verificationState.baseline_window.sample_count} events</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block mb-1 text-[11px] font-sans">Avg Cost per Execution</span>
            <span className="font-bold text-slate-900 text-sm">${verificationState.baseline_window.avg_cost_per_call_usd.toFixed(6)}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block mb-1 text-[11px] font-sans">Baseline Spend Basis</span>
            <span className="font-bold text-slate-900 text-sm">${finding.baseline_spend_usd.toFixed(4)}</span>
          </div>
        </div>
      </div>

      {/* Observation Window & Results (if deployed) */}
      {!isBaseline && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <MetricTile
              id="metric-verify-pre"
              label="Pre-Deployment Unit Cost"
              value={`$${verificationState.observed_result?.pre_cost_per_call_usd.toFixed(4) || '0.00'}`}
              subtext="Historical baseline per call"
              provenance="CALCULATED"
            />
            <MetricTile
              id="metric-verify-post"
              label="Post-Deployment Unit Cost"
              value={`$${verificationState.observed_result?.post_cost_per_call_usd.toFixed(4) || '0.00'}`}
              subtext={`Across ${verificationState.observation_window?.sample_event_count || 0} observed events`}
              provenance={isVerified ? 'VERIFIED' : 'ESTIMATED'}
              highlight={isVerified}
            />
            <MetricTile
              id="metric-verify-realized"
              label="Empirical Unit Reduction"
              value={`${verificationState.observed_result?.observed_reduction_pct || 0}%`}
              subtext={
                isVerified
                  ? `Sustained annual savings: $${verificationState.observed_result?.annualized_realized_savings_usd.toLocaleString()}`
                  : 'Requires >= 15 events threshold'
              }
              provenance={isVerified ? 'VERIFIED' : 'ESTIMATED'}
            />
          </div>

          {/* Verification Verdict & Notes */}
          <div
            className={`p-5 rounded-2xl border ${
              isVerified
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : 'bg-amber-50/70 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2 mb-2 font-bold text-xs uppercase tracking-wider">
              {isVerified ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>Verified Result: Empirical Confidence High</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Observation Active: Insufficient Observation Sample</span>
                </>
              )}
            </div>
            <p className="text-xs sm:text-sm leading-relaxed">
              {verificationState.observed_result?.verification_notes}
            </p>
          </div>
        </div>
      )}

      {/* Interactive Verification Workflow Controls */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Verification Testing &amp; Lifecycle Controls
        </h3>

        {isBaseline ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Step 1: Mark Deployment as Live</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Sets the deployment timestamp. Subsequent telemetry events will be evaluated in the observation window.
              </p>
            </div>
            <button
              type="button"
              id="btn-mark-deployed"
              onClick={() => onDeploy(finding.id)}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shrink-0"
            >
              Mark Deployed &amp; Start Observation
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-slate-600 leading-relaxed">
              Deployment timestamp logged: <strong className="font-mono text-slate-900">{verificationState.deployment_timestamp}</strong>.
              Provide subsequent telemetry to evaluate whether the unit reduction holds true.
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                id="btn-ingest-insufficient-sample"
                onClick={() => onIngestObservation(finding.id, 5)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Simulate 5 Events (Triggers Insufficient Observation)
              </button>

              <button
                type="button"
                id="btn-ingest-full-verification"
                onClick={() => onIngestObservation(finding.id, 25)}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs"
              >
                Simulate 25 Events (Triggers Empirical Verification)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
