/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Finding, VerificationState, AIEvent } from '../types/domain';
import { MetricTile } from '../components/MetricTile';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Clock, Layers } from 'lucide-react';
import { calculateOutcomeFee, COMMERCIAL_PRICING } from '../engine/billing/outcome';

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
            Empirical Post-Deployment Verification
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

          {/* Outcome Fee Commercial Calculation (if verified) */}
          {isVerified && (() => {
            const verifiedAnnualSavings = verificationState.observed_result?.annualized_realized_savings_usd || 0;
            const verifiedMonthlySavings = verifiedAnnualSavings / 12;
            const estimatedMonthlySavings = (finding.annualized_projection_usd && finding.annualized_projection_usd > 0)
              ? Number((finding.annualized_projection_usd / 12).toFixed(2))
              : 0;
            const outcome = calculateOutcomeFee(verifiedMonthlySavings, estimatedMonthlySavings);

            return (
              <div className="p-6 rounded-2xl bg-white border-2 border-emerald-600 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 font-mono">
                        Step 3: Verified Outcome Fee Evaluation
                      </h3>
                      {verificationState.is_simulated && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 uppercase tracking-wide">
                          Demo / Simulation Telemetry
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pay once, only after verification &bull; Capped at {COMMERCIAL_PRICING.OUTCOME_FEE_CAP_MONTHS.toFixed(0)} month of verified savings
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] uppercase tracking-wider font-mono text-slate-500 block">
                      {verificationState.is_simulated ? 'Simulated One-Time Fee' : 'Final One-Time Fee'}
                    </span>
                    <span className="text-2xl font-extrabold font-mono text-emerald-700">
                      ${outcome.finalOutcomeFeeUsd.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Mathematical breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block text-[11px] font-sans">Original Estimate/mo</span>
                    <span className="font-bold text-slate-900">${outcome.originalEstimatedMonthlySavingsUsd.toFixed(2)}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block text-[11px] font-sans">Verified Run-rate/mo</span>
                    <span className="font-bold text-slate-900">${outcome.verifiedMonthlyRunRateUsd.toFixed(2)}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block text-[11px] font-sans">Realized Ratio</span>
                    <span className={`font-bold ${outcome.protectionTriggered ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {(outcome.realizedRatio * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block text-[11px] font-sans">Annualized (&times;12)</span>
                    <span className="font-bold text-slate-900">${outcome.verifiedAnnualizedSavingsUsd.toFixed(2)}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block text-[11px] font-sans">{(COMMERCIAL_PRICING.OUTCOME_FEE_ANNUAL_PCT * 100).toFixed(0)}% Annualized Fee</span>
                    <span className="font-bold text-slate-600">${outcome.rawOutcomeFeeUsd.toFixed(2)}</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block text-[11px] font-sans">{COMMERCIAL_PRICING.OUTCOME_FEE_CAP_MONTHS.toFixed(0)}-Mo Cap ({COMMERCIAL_PRICING.OUTCOME_FEE_CAP_MONTHS.toFixed(1)}&times;)</span>
                    <span className="font-bold text-emerald-700">${outcome.capAmountUsd.toFixed(2)}</span>
                  </div>
                </div>

                {/* 50% Protection Clause Callout */}
                {outcome.protectionTriggered ? (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                    <span className="font-bold block mb-0.5">{(COMMERCIAL_PRICING.PROTECTION_MIN_RATIO * 100).toFixed(0)}% Protection Clause Triggered &mdash; Outcome Fee Waived ($0.00)</span>
                    <p className="leading-relaxed">
                      {outcome.protectionReason || `Verified savings achieved ${(outcome.realizedRatio * 100).toFixed(1)}% of original estimate, which is below the ${(COMMERCIAL_PRICING.PROTECTION_MIN_RATIO * 100).toFixed(0)}% threshold. You owe $0.00 outcome fee.`}
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold block">{(COMMERCIAL_PRICING.PROTECTION_MIN_RATIO * 100).toFixed(0)}% Protection Condition Satisfied</span>
                      <span className="text-slate-600">
                        Achieved {(outcome.realizedRatio * 100).toFixed(1)}% of original estimate (threshold &ge; {(COMMERCIAL_PRICING.PROTECTION_MIN_RATIO * 100).toFixed(0)}%). Fee bound by {COMMERCIAL_PRICING.OUTCOME_FEE_CAP_MONTHS.toFixed(0)}-month cap.
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-700 px-2 py-1 bg-white rounded border border-emerald-200">
                      Cap Bound: ${outcome.finalOutcomeFeeUsd.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="text-[11px] text-slate-500 leading-relaxed pt-2 border-t border-slate-100 flex items-start gap-1.5">
                  <span className="font-semibold text-slate-700 shrink-0">Truth Boundary:</span>
                  <span>Verification measures what changed. It does not guarantee future results. No ongoing percentage, recurring retainers, or subscription commitments.</span>
                </div>
              </div>
            );
          })()}
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
              <h4 className="text-sm font-bold text-slate-900">Lifecycle Action: Mark Deployment as Live</h4>
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
