/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowRight, ShieldCheck, Database, CheckCircle2, Search, Sliders, RefreshCw } from 'lucide-react';

interface LandingViewProps {
  onStartAudit: () => void;
  onLoadSample: () => void;
  onNavigate: (route: string) => void;
  hasActiveAudit?: boolean;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onStartAudit,
  onLoadSample,
  onNavigate,
  hasActiveAudit = false,
}) => {
  return (
    <div className="space-y-12 sm:space-y-16 pb-16">
      {/* Hero Section */}
      <section className="pt-8 sm:pt-14 text-center max-w-3xl mx-auto px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-2xs mb-5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Non-Invasive AI Cost Optimization</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
          You already have observability.{' '}
          <span className="text-emerald-700 block mt-1">Now find the money you&apos;re wasting.</span>
        </h1>

        <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
          AIDisCost connects to your existing telemetry to uncover model right-sizing opportunities,
          unbacked retry storms, and redundant call loops — backed by deterministic mathematical proof.
        </p>

        {/* Primary CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-md mx-auto">
          {hasActiveAudit ? (
            <button
              type="button"
              id="btn-hero-resume-audit"
              onClick={() => onNavigate('/audit')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-all shadow-sm flex items-center justify-center gap-2 focus:ring-2 focus:ring-emerald-600 focus:outline-hidden"
            >
              <span>Resume Active Audit</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              id="btn-hero-start-audit"
              onClick={onStartAudit}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-2 focus:ring-2 focus:ring-slate-900 focus:outline-hidden"
            >
              <span>Start Free Audit</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            id="btn-hero-load-sample"
            onClick={onLoadSample}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-slate-300 bg-white text-slate-800 font-bold text-sm hover:bg-slate-50 transition-all shadow-2xs flex items-center justify-center gap-2 focus:ring-2 focus:ring-slate-400 focus:outline-hidden"
          >
            <span>Try Sample Dataset</span>
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Zero proxy dependency &bull; Read-only export parsing &bull; Zero raw prompts persisted
        </p>
      </section>

      {/* The 4-Step Engineering Workflow */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            The AIDisCost Operating Principle
          </h2>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            FIND &rarr; PROVE &rarr; FIX &rarr; VERIFY
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold mb-3 border border-emerald-100">
              <Search className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">1. FIND</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Detect model right-sizing gaps, runaway retry storms, and redundant prompt executions across Langfuse, Helicone, OpenTelemetry, and custom logs.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold mb-3 border border-blue-100">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">2. PROVE</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every finding reveals its mathematical proof, source cost provenance, token distributions, and correlated trace IDs. No AI hallucinations.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold mb-3 border border-purple-100">
              <Sliders className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">3. FIX</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Actionable engineering packages providing root-cause analysis, traffic canary plans, acceptance criteria, and rollback instructions for $49.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold mb-3 border border-teal-100">
              <RefreshCw className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 text-base mb-1">4. VERIFY</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Empirical before-and-after comparison. We never declare verified savings until post-deployment telemetry demonstrates sustained unit reduction.
            </p>
          </div>
        </div>
      </section>

      {/* Strict Truth & Architecture Guarantees */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900 text-white shadow-md">
          <div className="max-w-2xl">
            <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
              Non-Negotiable Guardrails
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 mb-4">
              Built for Engineering Trust, Not Vanity Metrics
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-slate-800 text-sm">
            <div>
              <div className="flex items-center gap-2 font-bold text-white mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Read-Only by Default</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                AIDisCost never touches your production infrastructure, alters your provider keys, or injects runtime proxies in your request path.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 font-bold text-white mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Deterministic Pricing Truth</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every calculation is governed by an explicit pricing registry. Source-reported costs and calculated estimates are never conflated.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 font-bold text-white mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Conservative Verification</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                We refuse to label savings &quot;verified&quot; without sufficient sample volume and sustained observation across identical workloads.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Tiers Overview */}
      <section className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Transparent Pricing Structure
          </h2>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            Free Diagnostics &bull; $49 per Verified Fix Package
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-white border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase">Free Audit</span>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1 mb-3">$0</div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Full data health check, spend analysis, and evidence summary for all detected patterns.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
              <li className="flex items-center gap-1.5">&bull; 4 telemetry adapters</li>
              <li className="flex items-center gap-1.5">&bull; Data health gate</li>
              <li className="flex items-center gap-1.5">&bull; Mathematical proof</li>
            </ul>
          </div>

          <div className="p-5 rounded-xl bg-white border-2 border-emerald-600 shadow-sm relative">
            <span className="absolute -top-2.5 right-4 bg-emerald-600 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Primary Deliverable
            </span>
            <span className="text-xs font-semibold text-emerald-700 uppercase">Optimization Fix</span>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1 mb-3">$49 <span className="text-xs font-normal text-slate-500">/ finding</span></div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Complete engineering fix package with root cause, canary test plan, and rollback criteria.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
              <li className="flex items-center gap-1.5">&bull; Root cause hypothesis</li>
              <li className="flex items-center gap-1.5">&bull; 48h canary test plan</li>
              <li className="flex items-center gap-1.5">&bull; Verification guide</li>
            </ul>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase">Continuous</span>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1 mb-3">$79 <span className="text-xs font-normal text-slate-500">/ month</span></div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Automated recurring audits and continuous telemetry monitoring for production teams.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
              <li className="flex items-center gap-1.5">&bull; Weekly batch audits</li>
              <li className="flex items-center gap-1.5">&bull; Regressive drift alerts</li>
              <li className="flex items-center gap-1.5">&bull; Multi-source ingestion</li>
            </ul>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200">
            <span className="text-xs font-semibold text-slate-500 uppercase">Team Tier</span>
            <div className="text-2xl font-bold font-mono text-slate-900 mt-1 mb-3">$199 <span className="text-xs font-normal text-slate-500">/ month</span></div>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Multi-project organization hierarchy with custom model pricing registry overrides.
            </p>
            <ul className="text-xs text-slate-600 space-y-1.5 font-medium">
              <li className="flex items-center gap-1.5">&bull; Unlimited findings</li>
              <li className="flex items-center gap-1.5">&bull; Custom enterprise rates</li>
              <li className="flex items-center gap-1.5">&bull; Priority support</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};
