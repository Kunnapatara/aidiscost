/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Finding, FixPackage } from '../types/domain';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { Lock, Unlock, ArrowLeft, ArrowRight, ShieldCheck, CheckCircle2, Sliders, AlertTriangle, RefreshCw } from 'lucide-react';

interface FixPackageViewProps {
  finding: Finding;
  fixPackage: FixPackage;
  onUnlock: (findingId: string) => void;
  onBack: () => void;
  onProceedVerify: (findingId: string) => void;
}

export const FixPackageView: React.FC<FixPackageViewProps> = ({
  finding,
  fixPackage,
  onUnlock,
  onBack,
  onProceedVerify,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSimulatePayment = () => {
    setIsProcessing(true);
    setTimeout(() => {
      onUnlock(finding.id);
      setIsProcessing(false);
    }, 700);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          id="btn-back-to-finding"
          onClick={onBack}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Evidence (Finding)</span>
        </button>

        <div className="flex items-center gap-2">
          {fixPackage.unlocked ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
              <Unlock className="w-3.5 h-3.5 text-emerald-700" />
              <span>UNLOCKED DELIVERABLE</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
              <Lock className="w-3.5 h-3.5 text-slate-600" />
              <span>$49 FIX PACKAGE</span>
            </span>
          )}
        </div>
      </div>

      {/* Package Header */}
      <div>
        <span className="text-xs font-mono uppercase tracking-wider text-purple-700 font-semibold">
          Step 3: Actionable Engineering Plan (FIX)
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
          Optimization Fix Package: {finding.title}
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-2xl">
          Engineered remediation plan for {finding.affected_scope}. Non-invasive specification
          designed for your team to test, merge, and verify without vendor lock-in.
        </p>
      </div>

      {/* Unlock Callout Banner (if locked) */}
      {!fixPackage.unlocked && (
        <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
              <Lock className="w-4 h-4" />
              <span>Actionable Engineering Deliverable</span>
            </div>
            <h2 className="text-xl font-bold">Unlock Full Implementation Specifications</h2>
            <p className="text-xs text-slate-300 mt-1 max-w-lg leading-relaxed">
              Unlocks the root cause diagnosis, 48-hour canary test harness instructions,
              acceptance criteria checklist, rollback protocol, and verification thresholds.
            </p>
          </div>

          <div className="shrink-0 flex flex-col items-start sm:items-end gap-2">
            <button
              type="button"
              id="btn-purchase-unlock"
              onClick={handleSimulatePayment}
              disabled={isProcessing}
              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors shadow-sm flex items-center gap-2"
            >
              {isProcessing ? (
                <span>Verifying Entitlement...</span>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  <span>Unlock Fix Package ($49)</span>
                </>
              )}
            </button>
            <span className="text-[11px] text-slate-400">Instant unlock &bull; Test simulation mode</span>
          </div>
        </div>
      )}

      {/* Expected Impact Summary (Visible before & after) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Projected Monthly Savings
          </span>
          <span className="text-2xl font-bold font-mono text-emerald-700 tabular-nums">
            ${fixPackage.expected_impact.monthly_savings_usd.toFixed(2)}
          </span>
          <p className="text-[11px] text-slate-500 mt-1">Direct reduction at steady state volume</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Expected Latency Delta
          </span>
          <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {fixPackage.expected_impact.latency_delta_ms} ms
          </span>
          <p className="text-[11px] text-slate-500 mt-1">Estimated turn-around variance</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
            Quality Risk Grade
          </span>
          <span className="text-2xl font-bold font-mono text-slate-900">
            {fixPackage.expected_impact.quality_risk}
          </span>
          <p className="text-[11px] text-slate-500 mt-1">Evaluated by task complexity constraints</p>
        </div>
      </div>

      {/* Main Fix Package Details (Revealed or Previewed) */}
      <div className="space-y-6">
        {/* 1. Root Cause Hypothesis */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <span>1. Root Cause Hypothesis</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">
            {fixPackage.root_cause_hypothesis}
          </p>
        </div>

        {/* 2. Recommended Approach */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <span>2. Recommended Architecture Approach</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-sans">
            {fixPackage.recommended_approach}
          </p>
        </div>

        {/* 3. Test Plan & Canary Harness (Locked/Unlocked) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 space-y-3 relative overflow-hidden">
          {!fixPackage.unlocked && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center p-4 z-10">
              <div className="text-center max-w-sm">
                <Lock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-900">Canary Test Plan Locked</h4>
                <p className="text-xs text-slate-500 mt-1 mb-3">
                  Unlock the $49 package to view sample sizes, harness configuration, and evaluation thresholds.
                </p>
                <button
                  type="button"
                  id="btn-unlock-testplan"
                  onClick={handleSimulatePayment}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  Unlock Plan
                </button>
              </div>
            </div>
          )}

          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            3. Test Plan &amp; Canary Harness Configuration
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-500 block mb-1">Recommended Sample Size</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {fixPackage.test_plan.sample_size} cases
              </span>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="font-semibold text-slate-500 block mb-1">Canary Traffic Allocation</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {fixPackage.test_plan.traffic_allocation_pct}% of live requests
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="font-semibold text-slate-700 block mb-1">Evaluation Criteria:</span>
            <p className="text-slate-600 font-mono">{fixPackage.test_plan.evaluation_criteria}</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <span className="font-semibold text-slate-700 block mb-1">Test Harness Instructions:</span>
            <p className="text-slate-600 leading-relaxed font-sans">{fixPackage.test_plan.test_harness_instructions}</p>
          </div>
        </div>

        {/* 4. Acceptance Criteria Checklist */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 space-y-3 relative overflow-hidden">
          {!fixPackage.unlocked && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center p-4 z-10">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Acceptance criteria checklist locked
              </span>
            </div>
          )}

          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            4. Acceptance Criteria Checklist
          </h3>

          <div className="space-y-2">
            {fixPackage.acceptance_criteria.map((crit, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{crit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Rollback Plan */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>5. Rapid Rollback Protocol</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-sans">
            {fixPackage.rollback_plan}
          </p>
        </div>

        {/* 6. Verification Protocol */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-teal-600" />
            <span>6. Verification Protocol</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-sans">
            {fixPackage.verification_instructions}
          </p>
        </div>
      </div>

      {/* Footer / Progression CTA */}
      <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          id="btn-fix-back"
          onClick={onBack}
          className="text-xs font-bold text-slate-600 hover:text-slate-900"
        >
          &larr; Back to Evidence
        </button>

        <button
          type="button"
          id="btn-fix-to-verify"
          onClick={() => onProceedVerify(finding.id)}
          className="px-6 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors shadow-xs flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4 text-emerald-400" />
          <span>Proceed to Post-Deployment Verification</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
