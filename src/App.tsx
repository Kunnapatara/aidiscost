/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  AIEvent,
  AuditSummary,
  DataHealthReport,
  Finding,
  FixPackage,
  TelemetrySource,
  VerificationState,
} from './types/domain';
import { LangfuseAdapter } from './engine/adapters/langfuse';
import { HeliconeAdapter } from './engine/adapters/helicone';
import { OpenTelemetryAdapter } from './engine/adapters/opentelemetry';
import { CustomLogAdapter } from './engine/adapters/custom-log';
import { IngestionPipeline } from './engine/ingestion/pipeline';
import { generateSampleDataset } from './engine/adapters/sample-data';
import { evaluateDataHealth } from './engine/health/evaluator';
import { runOptimizationRules } from './engine/rules/evaluator';
import { generateFixPackage } from './engine/fix/generator';
import { initializeVerificationState, evaluateVerification } from './engine/verification/comparator';
import { BillingEntitlementStore } from './engine/billing/entitlement';
import { AuditStore } from './engine/storage/audit-store';
import { HeaderNav } from './components/HeaderNav';
import { LandingView } from './views/LandingView';
import { ConnectView } from './views/ConnectView';
import { DataHealthView } from './views/DataHealthView';
import { AuditSummaryView } from './views/AuditSummaryView';
import { FindingDetailView } from './views/FindingDetailView';
import { FixPackageView } from './views/FixPackageView';
import { VerifyView } from './views/VerifyView';
import { AuthModal, BillingResultModal, ErrorView, ErrorCategory } from './components/SupportingModals';

export default function App() {
  // Navigation & Routing State
  const [currentRoute, setCurrentRoute] = useState<string>('/');
  const [activeFindingId, setActiveFindingId] = useState<string | undefined>(undefined);

  // Ingestion & Domain State
  const [activeSource, setActiveSource] = useState<TelemetrySource>('custom_logs');
  const [currentEvents, setCurrentEvents] = useState<AIEvent[]>([]);
  const [healthReport, setHealthReport] = useState<DataHealthReport | null>(null);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [isSampleData, setIsSampleData] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fix Packages & Verification Maps
  const [fixPackages, setFixPackages] = useState<Map<string, FixPackage>>(new Map());
  const [verificationStates, setVerificationStates] = useState<Map<string, VerificationState>>(new Map());

  // Supporting States
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('kunnapatara@gmail.com');

  const [billingResultModal, setBillingResultModal] = useState<{
    isOpen: boolean;
    status: 'success' | 'cancelled' | 'error';
    findingId?: string;
  }>({ isOpen: false, status: 'success' });

  const [errorState, setErrorState] = useState<{
    isError: boolean;
    category: ErrorCategory;
    message: string;
    technicalDetails?: string;
  }>({
    isError: false,
    category: 'UNKNOWN_ERROR',
    message: '',
  });

  // Handle URL hash / initial load and restore durable audit snapshot
  useEffect(() => {
    let isMounted = true;

    const handlePopState = () => {
      const hash = window.location.hash.replace('#', '') || '/';
      parseAndSetRoute(hash);
    };
    window.addEventListener('popstate', handlePopState);

    // Hydrate latest audit snapshot from local IndexedDB
    AuditStore.loadLatestAuditSnapshot()
      .then((snapshot) => {
        if (!isMounted || !snapshot) {
          if (window.location.hash) {
            handlePopState();
          }
          return;
        }

        // Restore audit domain state
        setActiveSource(snapshot.source);
        setHealthReport(snapshot.health);
        setAuditSummary(snapshot.audit_summary);
        setIsSampleData(Boolean(snapshot.is_sample_data));

        if (snapshot.active_finding_id) {
          setActiveFindingId(snapshot.active_finding_id);
        }

        // Restore Maps
        const restoredFixMap = new Map<string, FixPackage>(
          Object.entries(snapshot.fix_packages || {})
        );
        const restoredVerifyMap = new Map<string, VerificationState>(
          Object.entries(snapshot.verification_states || {})
        );
        setFixPackages(restoredFixMap);
        setVerificationStates(restoredVerifyMap);

        // Determine destination route
        const currentHash = window.location.hash.replace('#', '');
        if (currentHash && currentHash !== '/') {
          parseAndSetRoute(currentHash);
        } else if (snapshot.current_route && snapshot.current_route !== '/') {
          navigateTo(snapshot.current_route);
        } else {
          // If at root but audit restored, route to audit summary
          navigateTo('/audit');
        }
      })
      .catch((err) => {
        console.warn('[AuditStore] Hydration notice:', (err as Error).message);
        if (window.location.hash) {
          handlePopState();
        }
      });

    return () => {
      isMounted = false;
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const persistCurrentSnapshot = (overrides?: {
    auditSummary?: AuditSummary | null;
    healthReport?: DataHealthReport | null;
    fixPackages?: Map<string, FixPackage>;
    verificationStates?: Map<string, VerificationState>;
    activeFindingId?: string;
    currentRoute?: string;
    isSampleData?: boolean;
    source?: TelemetrySource;
  }) => {
    const summary = overrides?.auditSummary !== undefined ? overrides.auditSummary : auditSummary;
    const health = overrides?.healthReport !== undefined ? overrides.healthReport : healthReport;
    const fixMap = overrides?.fixPackages !== undefined ? overrides.fixPackages : fixPackages;
    const verifyMap = overrides?.verificationStates !== undefined ? overrides.verificationStates : verificationStates;
    const fndId = overrides?.activeFindingId !== undefined ? overrides.activeFindingId : activeFindingId;
    const route = overrides?.currentRoute !== undefined ? overrides.currentRoute : currentRoute;

    if (!summary || !health) return;

    try {
      const snapshot = AuditStore.buildSnapshot({
        auditSummary: summary,
        healthReport: health,
        findings: summary.findings,
        fixPackages: fixMap,
        verificationStates: verifyMap,
        activeFindingId: fndId,
        currentRoute: route,
      });

      if (overrides?.isSampleData !== undefined) {
        snapshot.is_sample_data = overrides.isSampleData;
      }
      if (overrides?.source !== undefined) {
        snapshot.source = overrides.source;
      }

      AuditStore.saveAuditSnapshot(snapshot).catch((err) => {
        console.warn('[AuditStore] Non-blocking snapshot save warning:', (err as Error).message);
      });
    } catch (err) {
      console.warn('[AuditStore] Non-blocking snapshot build warning:', (err as Error).message);
    }
  };

  const navigateTo = (route: string) => {
    setCurrentRoute(route);
    window.location.hash = route;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update persisted route in active audit snapshot
    if (auditSummary && healthReport) {
      persistCurrentSnapshot({ currentRoute: route });
    }
  };

  const parseAndSetRoute = (route: string) => {
    if (route.startsWith('/finding/')) {
      const parts = route.split('/');
      if (parts[2]) {
        setActiveFindingId(parts[2]);
      }
    }
    setCurrentRoute(route);
  };

  // Ingestion Workflow
  const handleIngestPayload = (rawContent: string, source: TelemetrySource, fileName: string) => {
    setIsLoading(true);
    setErrorState({ isError: false, category: 'UNKNOWN_ERROR', message: '' });

    setTimeout(() => {
      try {
        const pipelineResult = IngestionPipeline.ingest(rawContent, { source, fileName });

        if (!pipelineResult.success) {
          setErrorState({
            isError: true,
            category: 'PARSING_ERROR',
            message: pipelineResult.errorMessage || `Failed to extract valid telemetry events from "${fileName}".`,
            technicalDetails:
              pipelineResult.warnings.join('\n') ||
              'Check column headers (model, input_tokens, output_tokens) or JSON schema.',
          });
          setIsLoading(false);
          return;
        }

        const ingestResult = pipelineResult.ingestResult;

        // Run Data Health Gate
        const health = evaluateDataHealth(
          ingestResult.events,
          ingestResult.raw_event_count,
          ingestResult.duplicate_count,
          false
        );

        // Run Deterministic Rules
        const audit = runOptimizationRules(ingestResult.events, ingestResult.source, health, false);

        // Initialize Fix Packages and Verification states
        const fixMap = new Map<string, FixPackage>();
        const verifyMap = new Map<string, VerificationState>();
        const billingStore = BillingEntitlementStore.getInstance();

        for (const fnd of audit.findings) {
          const isUnlocked = billingStore.isUnlocked(fnd.id);
          fixMap.set(fnd.id, generateFixPackage(fnd, isUnlocked));
          verifyMap.set(fnd.id, initializeVerificationState(fnd));
        }

        setActiveSource(ingestResult.source);
        setCurrentEvents(ingestResult.events);
        setHealthReport(health);
        setAuditSummary(audit);
        setFixPackages(fixMap);
        setVerificationStates(verifyMap);
        setIsSampleData(false);
        setIsLoading(false);

        // Durable persistence: save canonical snapshot immediately after audit creation
        persistCurrentSnapshot({
          auditSummary: audit,
          healthReport: health,
          fixPackages: fixMap,
          verificationStates: verifyMap,
          activeFindingId: audit.findings[0]?.id,
          currentRoute: '/audit/health',
          isSampleData: false,
          source: ingestResult.source,
        });

        // Step 2 in workflow: Always show Data Health first
        navigateTo('/audit/health');
      } catch (err) {
        setErrorState({
          isError: true,
          category: 'SOURCE_ERROR',
          message: `Unexpected error during telemetry parsing: ${(err as Error).message}`,
          technicalDetails: (err as Error).stack,
        });
        setIsLoading(false);
      }
    }, 150);
  };

  // Sample Dataset Loader
  const handleLoadSampleDataset = () => {
    setIsLoading(true);
    setTimeout(() => {
      const sample = generateSampleDataset();
      const health = evaluateDataHealth(sample.events, sample.raw_event_count, 0, true);
      const audit = runOptimizationRules(sample.events, 'custom_logs', health, true);

      const fixMap = new Map<string, FixPackage>();
      const verifyMap = new Map<string, VerificationState>();
      const billingStore = BillingEntitlementStore.getInstance();

      for (const fnd of audit.findings) {
        const isUnlocked = billingStore.isUnlocked(fnd.id);
        fixMap.set(fnd.id, generateFixPackage(fnd, isUnlocked));
        verifyMap.set(fnd.id, initializeVerificationState(fnd));
      }

      setActiveSource('custom_logs');
      setCurrentEvents(sample.events);
      setHealthReport(health);
      setAuditSummary(audit);
      setFixPackages(fixMap);
      setVerificationStates(verifyMap);
      setIsSampleData(true);
      setIsLoading(false);

      // Durable persistence: save sample dataset audit snapshot
      persistCurrentSnapshot({
        auditSummary: audit,
        healthReport: health,
        fixPackages: fixMap,
        verificationStates: verifyMap,
        activeFindingId: audit.findings[0]?.id,
        currentRoute: '/audit/health',
        isSampleData: true,
        source: 'custom_logs',
      });

      navigateTo('/audit/health');
    }, 150);
  };

  // Handle Finding Selection
  const handleSelectFinding = (findingId: string) => {
    setActiveFindingId(findingId);
    if (auditSummary && healthReport) {
      persistCurrentSnapshot({ activeFindingId: findingId, currentRoute: `/finding/${findingId}` });
    }
    navigateTo(`/finding/${findingId}`);
  };

  // Handle Fix Package Unlock ($49 flow)
  const handleUnlockFixPackage = (findingId: string) => {
    const billingStore = BillingEntitlementStore.getInstance();
    billingStore.unlockFixPackage(findingId);

    // Update state
    setFixPackages((prev) => {
      const updated = new Map(prev);
      const pkg = updated.get(findingId);
      if (pkg) {
        updated.set(findingId, {
          ...pkg,
          unlocked: true,
          unlocked_at: new Date().toISOString(),
        });
      }
      persistCurrentSnapshot({ fixPackages: updated });
      return updated;
    });

    setBillingResultModal({
      isOpen: true,
      status: 'success',
      findingId,
    });
  };

  // Handle Verification Deployment Mark
  const handleMarkDeployed = (findingId: string) => {
    setVerificationStates((prev) => {
      const updated = new Map(prev);
      const current = updated.get(findingId);
      if (current) {
        updated.set(findingId, {
          ...current,
          stage: 'OBSERVATION_ACTIVE',
          deployment_timestamp: new Date().toISOString(),
          observation_window: {
            start: new Date().toISOString(),
            end: new Date().toISOString(),
            sample_event_count: 0,
          },
          observed_result: {
            pre_cost_per_call_usd: current.baseline_window.avg_cost_per_call_usd,
            post_cost_per_call_usd: 0,
            observed_reduction_pct: 0,
            annualized_realized_savings_usd: 0,
            verification_confidence: 'INSUFFICIENT_OBSERVATION',
            verification_notes:
              'Observation window initiated. Telemetry events will be monitored for sustained unit cost reduction.',
          },
        });
      }
      persistCurrentSnapshot({ verificationStates: updated });
      return updated;
    });
  };

  // Handle Simulation of Post-Deployment Telemetry Observation Window
  const handleSimulatePostObservation = (findingId: string, eventCount: number) => {
    const fnd = auditSummary?.findings.find((f) => f.id === findingId);
    if (!fnd) return;

    const currentVerifyState = verificationStates.get(findingId);
    if (!currentVerifyState) return;

    // Generate realistic post-deployment events reflecting optimization target
    const simulatedPostEvents: AIEvent[] = [];
    const baseNow = Date.now();

    for (let i = 0; i < eventCount; i++) {
      const timestamp = new Date(baseNow + i * 20_000).toISOString();
      const candidateCost = fnd.candidate_spend_usd > 0
        ? fnd.candidate_spend_usd / fnd.eligible_event_count
        : currentVerifyState.baseline_window.avg_cost_per_call_usd * 0.15; // 85% reduction

      simulatedPostEvents.push({
        id: `post_evt_${i}`,
        source: activeSource,
        source_event_id: `post_${i}`,
        timestamp,
        provider: 'openai',
        model: 'gpt-4o-mini',
        operation: 'chat',
        input_tokens: 120,
        output_tokens: 25,
        total_tokens: 145,
        latency_ms: 180,
        status: 'SUCCESS',
        trace_id: `post_tr_${i}`,
        tool_calls: [],
        source_reported_cost_usd: candidateCost,
        calculated_cost_usd: candidateCost,
        resolved_cost_usd: candidateCost,
        cost_provenance: 'CALCULATED',
        cost_confidence: 'HIGH',
        metadata: { post_deployment: true },
        is_simulated: true,
      });
    }

    const newVerifyState = evaluateVerification(currentVerifyState, fnd, simulatedPostEvents);

    setVerificationStates((prev) => {
      const updated = new Map(prev);
      updated.set(findingId, newVerifyState);
      persistCurrentSnapshot({ verificationStates: updated });
      return updated;
    });
  };

  // Active finding lookup
  const activeFinding = auditSummary?.findings.find((f) => f.id === activeFindingId) || auditSummary?.findings[0];
  const activeFixPackage = activeFinding ? fixPackages.get(activeFinding.id) : undefined;
  const activeVerificationState = activeFinding ? verificationStates.get(activeFinding.id) : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Contextual Header Navigation */}
      <HeaderNav
        currentRoute={currentRoute}
        onNavigate={navigateTo}
        isSampleData={isSampleData}
        hasActiveAudit={auditSummary !== null}
        activeFindingId={activeFinding?.id}
        source={activeSource}
        onOpenAuth={() => setShowAuthModal(true)}
        isAuthenticated={isAuthenticated}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {/* Error State Component */}
        {errorState.isError ? (
          <ErrorView
            category={errorState.category}
            message={errorState.message}
            technicalDetails={errorState.technicalDetails}
            onRetry={() => setErrorState({ isError: false, category: 'UNKNOWN_ERROR', message: '' })}
            onBackToConnect={() => {
              setErrorState({ isError: false, category: 'UNKNOWN_ERROR', message: '' });
              navigateTo('/connect');
            }}
          />
        ) : (
          <>
            {/* Route 1: / (Landing) */}
            {currentRoute === '/' && (
              <LandingView
                onStartAudit={() => navigateTo('/connect')}
                onLoadSample={handleLoadSampleDataset}
                onNavigate={navigateTo}
                hasActiveAudit={auditSummary !== null}
              />
            )}

            {/* Route 2: /connect (Connect) */}
            {currentRoute === '/connect' && (
              <ConnectView
                onIngestFile={handleIngestPayload}
                onLoadSample={handleLoadSampleDataset}
                isLoading={isLoading}
              />
            )}

            {/* Route 3: /audit/health (Data Health) */}
            {currentRoute === '/audit/health' && healthReport && (
              <DataHealthView
                health={healthReport}
                onProceed={() => navigateTo('/audit')}
                onBack={() => navigateTo('/connect')}
              />
            )}

            {/* Route 4: /audit (Audit Summary) */}
            {currentRoute === '/audit' && auditSummary && (
              <AuditSummaryView
                audit={auditSummary}
                onSelectFinding={handleSelectFinding}
                onViewHealth={() => navigateTo('/audit/health')}
              />
            )}

            {/* Route 5: /finding/:id (Finding Detail - PROVE) */}
            {currentRoute.startsWith('/finding/') && !currentRoute.endsWith('/fix') && activeFinding && (
              <FindingDetailView
                finding={activeFinding}
                onBack={() => navigateTo('/audit')}
                onOpenFix={(id) => navigateTo(`/finding/${id}/fix`)}
                onOpenVerify={(id) => navigateTo(`/verify/${id}`)}
              />
            )}

            {/* Route 6: /finding/:id/fix (Fix Package - FIX) */}
            {currentRoute.includes('/fix') && activeFinding && activeFixPackage && (
              <FixPackageView
                finding={activeFinding}
                fixPackage={activeFixPackage}
                onUnlock={handleUnlockFixPackage}
                onBack={() => navigateTo(`/finding/${activeFinding.id}`)}
                onProceedVerify={(id) => navigateTo(`/verify/${id}`)}
              />
            )}

            {/* Route 7: /verify/:id (Verification - VERIFY) */}
            {currentRoute.startsWith('/verify/') && activeFinding && activeVerificationState && (
              <VerifyView
                finding={activeFinding}
                verificationState={activeVerificationState}
                onDeploy={handleMarkDeployed}
                onIngestObservation={handleSimulatePostObservation}
                onBack={() => navigateTo(`/finding/${activeFinding.id}`)}
              />
            )}
          </>
        )}
      </main>

      {/* Supporting State Modals */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthenticate={(email) => {
          setUserEmail(email);
          setIsAuthenticated(true);
        }}
        currentEmail={userEmail}
      />

      <BillingResultModal
        isOpen={billingResultModal.isOpen}
        status={billingResultModal.status}
        findingId={billingResultModal.findingId}
        onReturnToFinding={(id) => {
          setBillingResultModal({ isOpen: false, status: 'success' });
          if (id) {
            navigateTo(`/finding/${id}/fix`);
          }
        }}
        onClose={() => setBillingResultModal({ isOpen: false, status: 'success' })}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">AIDisCost.com</span>
            <span>&bull;</span>
            <span>FIND &rarr; PROVE &rarr; FIX &rarr; VERIFY</span>
          </div>
          <div>Non-Invasive AI Cost Optimization &bull; Zero Raw Prompts Persisted</div>
        </div>
      </footer>
    </div>
  );
}
