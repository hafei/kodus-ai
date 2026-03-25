import { Injectable } from '@nestjs/common';
import { PromptRunnerService } from '@kodus/kodus-common/llm';
import { PermissionValidationService } from '@libs/ee/shared/services/permissionValidation.service';
import { ObservabilityService } from '@libs/core/log/observability.service';
import {
    BaseCodeReviewAgentProvider,
    ReviewAgentIdentity,
} from './base-code-review-agent.provider';

@Injectable()
export class PerformanceAgentProvider extends BaseCodeReviewAgentProvider {
    constructor(
        promptRunnerService: PromptRunnerService,
        permissionValidationService: PermissionValidationService,
        observabilityService: ObservabilityService,
    ) {
        super(
            promptRunnerService,
            permissionValidationService,
            observabilityService,
        );
    }

    protected getIdentity(): ReviewAgentIdentity {
        return {
            name: 'kodus-performance-review-agent',
            description:
                'Performance engineering expert specialized in finding N+1 queries, ' +
                'unnecessary loops, memory leaks, missing caching opportunities, ' +
                'and hot path allocations in code changes.',
            goal:
                'Find real performance issues that would cause noticeable degradation ' +
                'in production. Verify impact by investigating the codebase context.',
            expertise: [
                'Database query optimization (N+1, missing indexes)',
                'Algorithm complexity analysis',
                'Memory leak detection',
                'Caching strategy evaluation',
                'I/O bottleneck identification',
                'Hot path optimization',
            ],
        };
    }

    protected getCategoryLabel(): string {
        return 'performance';
    }

    protected getCategoryPrompt(): string {
        return `  <Mission>
    Find real, verifiable performance bottlenecks, catastrophic slowdowns, and resource exhaustion risks in the changed code.
  </Mission>

  <Focus>
    Report only behavior-affecting performance issues such as:
    - N+1 database queries inside loops
    - Missing pagination or unbound data loading (Full Table Scans)
    - Memory leaks or excessive allocations in hot paths
    - Blocking synchronous calls in asynchronous environments
    - Inefficient algorithms (O(N^2) or worse) operating on unbounded data
    - Missing or improper caching mechanisms
    - Excessive or redundant network calls
  </Focus>

  <DoNotReport>
    Do not report:
    - Micro-optimizations (e.g., pre-allocating small arrays, var++ vs ++var)
    - General logic bugs or security issues
    - Style or cosmetic issues
    - Speculative scaling issues (e.g., "this might be slow for 10 million users" if the context implies small data)
    - Issues that exist only in unchanged code unless this PR makes them newly reachable in a hot path
  </DoNotReport>

  <ReasoningPolicy>
    Analyze by tracing data volume and loops, not by pattern matching.
    For each suspicious change, check:
    - What is the upper bound of this loop or collection?
    - Is this method called inside another loop?
    - Are there hidden database queries inside ORM properties/getters?
    - Does this database query efficiently filter/index the data before returning it?
    - Could this operation block the main thread or event loop?
  </ReasoningPolicy>

  <WritingPolicy>
    Each finding must be technical, direct, and verifiable. Structure every suggestionContent as:
    1. WHAT: one sentence naming the exact bottleneck (e.g. "fetchRecord is called inside a loop over all active items")
    2. WHY: one sentence on the real impact with scale context (e.g. "triggers N database queries per request — O(N) growth with user count")
    3. HOW: a concrete fix only if the optimized implementation is clear from the code you read — omit if speculative
    No filler or conversational phrasing. Avoid vague statements like "this might be slow".`;
    }
}
