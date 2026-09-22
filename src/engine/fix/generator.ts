/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Finding, FixPackage } from '../../types/domain';

export function generateFixPackage(finding: Finding, isUnlocked: boolean = false): FixPackage {
  switch (finding.rule_id) {
    case 'MODEL_RIGHT_SIZING':
      return {
        finding_id: finding.id,
        unlocked: isUnlocked,
        root_cause_hypothesis:
          'Workload routing defaults to a frontier flagship model regardless of task complexity. For short classification, keyword extraction, and structured boolean validation tasks (<350 tokens), 90%+ of model capacity is unutilized.',
        recommended_approach:
          'Implement conditional workload routing or tier migration. Replace the static model parameter with a task-based router, pointing classification prompts to gpt-4o-mini or claude-3-5-haiku while retaining flagship models exclusively for complex multi-step reasoning.',
        expected_impact: {
          monthly_savings_usd: Number((finding.estimated_savings_usd * 30).toFixed(2)),
          latency_delta_ms: -280, // faster
          quality_risk: 'LOW',
        },
        test_plan: {
          sample_size: 250,
          evaluation_criteria: 'Accuracy match >= 99.2% on golden classification benchmark suite.',
          traffic_allocation_pct: 10,
          test_harness_instructions:
            'Deploy an A/B shadow-traffic proxy sending 10% of production traffic to candidate model. Log output schema and run automated semantic diff against baseline completions.',
        },
        acceptance_criteria: [
          'Classification F1-score matches or exceeds baseline within 0.5% tolerance across 250 test cases.',
          'Average response latency improves by at least 150ms.',
          'Zero schema validation or JSON parse failures in structured responses.',
          'Monthly spend on target endpoint drops by over 80%.',
        ],
        verification_instructions:
          'Run continuous observation for 48 hours post-deployment. Ensure error rates stay under 0.05% and cost per 1k transactions declines from $2.80 to under $0.35.',
        rollback_plan:
          'Maintain an environment variable flag (AI_MODEL_ROUTING_OVERRIDE). In case of unexpected degradation or drift, toggle back to the original model without requiring a redeployment.',
      };

    case 'RETRY_ERROR_LOOP':
      return {
        finding_id: finding.id,
        unlocked: isUnlocked,
        root_cause_hypothesis:
          'Client SDK error handling lacks decorrelated exponential backoff and jitter. When the provider returns HTTP 429 (rate limit) or 500 (transient gateway timeout), clients trigger immediate synchronous retries within < 100ms, worsening throttle conditions and burning token allocations on aborted calls.',
        recommended_approach:
          'Configure a resilient retry policy with Full Jitter exponential backoff. Cap maximum retries at 3 attempts, start initial backoff at 1,000ms with a multiplier of 2.0 and random jitter, and attach a circuit breaker that halts calls after 5 consecutive failures.',
        expected_impact: {
          monthly_savings_usd: Number((finding.estimated_savings_usd * 30).toFixed(2)),
          latency_delta_ms: 0,
          quality_risk: 'NEGLIGIBLE',
        },
        test_plan: {
          sample_size: 100,
          evaluation_criteria: 'Zero consecutive retry bursts exceeding 3 attempts in any 60-second window.',
          traffic_allocation_pct: 100,
          test_harness_instructions:
            'Simulate artificial HTTP 429 rate limit responses on a staging test suite. Validate that client waits at least 1.0s on attempt 1, 2.0s on attempt 2, and emits a structured circuit-breaker event rather than looping.',
        },
        acceptance_criteria: [
          'Consecutive retries per failure event strictly capped at <= 3.',
          'Exponential backoff with full random jitter enforced across all outbound LLM client calls.',
          'Wasted spend from aborted retry storms reduced to $0.00.',
        ],
        verification_instructions:
          'Monitor telemetry error traces for 72 hours. Check that retry bursts (status 429/500 count > 2 in 10s) are eliminated from system dashboards.',
        rollback_plan:
          'Revert client retry wrapper to previous configuration if circuit-breaker prematurely triggers during non-rate-limit network blips.',
      };

    case 'REPEATED_CALL_PATTERN':
      return {
        finding_id: finding.id,
        unlocked: isUnlocked,
        root_cause_hypothesis:
          'Stateless application architecture executes repetitive identical prompts (e.g. repeated user session lookups, FAQ queries, or static system prompt checks) multiple times within active user sessions without a temporary response cache.',
        recommended_approach:
          'Implement an application-level response cache (e.g., Redis or in-memory LRU) keyed by SHA-256 of the prompt and model parameters with a TTL of 10 to 60 minutes for deterministic (temperature <= 0.2) workloads.',
        expected_impact: {
          monthly_savings_usd: Number((finding.estimated_savings_usd * 30).toFixed(2)),
          latency_delta_ms: -650, // instant cache hits
          quality_risk: 'NEGLIGIBLE',
        },
        test_plan: {
          sample_size: 150,
          evaluation_criteria: 'Cache hit ratio >= 25% on recurring query paths with 0% data staleness.',
          traffic_allocation_pct: 50,
          test_harness_instructions:
            'Execute 50 synthetic test runs with 3 duplicate queries per session. Verify that call 1 queries provider API and calls 2 & 3 resolve in < 5ms from local cache.',
        },
        acceptance_criteria: [
          'Exact prompt matches within active 15-minute trace context return cached completions with < 10ms latency.',
          'Upstream API calls for identical requests drop by > 90%.',
          'Zero duplicate token charges incurred on recurring query patterns.',
        ],
        verification_instructions:
          'Examine post-deployment cache metrics. Verify that cache hit count accounts for at least 80% of previously flagged repeated executions.',
        rollback_plan:
          'Provide a cache-bypass header or configuration flag (CACHE_ENABLED=false) to disable cached responses immediately if dynamic prompt updates fail to invalidate properly.',
      };
  }
}
