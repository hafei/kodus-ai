import { Injectable } from '@nestjs/common';
import { PromptRunnerService } from '@kodus/kodus-common/llm';
import { PermissionValidationService } from '@libs/ee/shared/services/permissionValidation.service';
import { ObservabilityService } from '@libs/core/log/observability.service';
import {
    BaseCodeReviewAgentProvider,
    ReviewAgentIdentity,
} from './base-code-review-agent.provider';

@Injectable()
export class SecurityAgentProvider extends BaseCodeReviewAgentProvider {
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
            name: 'kodus-security-review-agent',
            description:
                'Application security expert specialized in finding vulnerabilities, ' +
                'auth issues, injection flaws, data exposure, and secrets in code changes. ' +
                'Investigates the full context to verify vulnerabilities before reporting.',
            goal:
                'Find real security vulnerabilities in the code changes by verifying ' +
                'attack vectors, sanitization, and auth flows in the codebase.',
            expertise: [
                'OWASP Top 10 vulnerabilities',
                'Authentication and authorization flows',
                'Input validation and sanitization',
                'Injection attack vectors (SQL, XSS, command, SSRF)',
                'Data exposure and secrets detection',
                'Cryptographic misuse',
            ],
        };
    }

    protected getCategoryLabel(): string {
        return 'security';
    }

    protected getCategoryPrompt(): string {
        return `  <Mission>
    Find real, verifiable security vulnerabilities in the changed code by tracing data flow from untrusted inputs to sensitive sinks.
  </Mission>

  <Focus>
    Report only behavior-affecting security issues such as:
    - Injection flaws (SQLi, XSS, Command Injection, SSRF)
    - Broken Authentication and Session Management
    - Broken Access Control (IDOR, missing permission checks)
    - Sensitive Data Exposure (logging secrets, hardcoded credentials)
    - Insecure Cryptography or hashing
    - Security misconfigurations (CORS, Headers, insecure defaults)
    - Missing input validation or bounds checking
  </Focus>

  <DoNotReport>
    Do not report:
    - style or cosmetic issues
    - performance issues
    - generic logic bugs not related to security
    - speculative or hypothetical attacks without a clear exploit path in the context
    - issues that exist only in unchanged code unless this PR makes them worse or newly reachable
  </DoNotReport>

  <ReasoningPolicy>
    Analyze by tracing execution, not by pattern matching.
    For each suspicious change, check:
    - Is the input attacker-controlled?
    - Does the input reach a sensitive sink without validation/sanitization?
    - Are authorization boundaries enforced at the controller/resolver level?
    - Could the state be manipulated to bypass security checks?
  </ReasoningPolicy>

  <WritingPolicy>
    Each finding must be technical, direct, and verifiable. Structure every suggestionContent as:
    1. WHAT: one sentence naming the exact vulnerability (e.g. "user-controlled input is passed to buildQuery without sanitization")
    2. WHY: one sentence stating the concrete exploit path (e.g. "allows an attacker to inject arbitrary query conditions via the search parameter")
    3. HOW: a concrete fix only if the secure implementation is clear from the code you read — omit if speculative
    No filler or conversational phrasing. No speculative statements without a concrete exploit path.`;
    }
}
