import { CreateSandboxParams, SandboxInstance } from './sandbox.provider';

export const SANDBOX_LEASE_MANAGER_TOKEN = Symbol('SandboxLeaseManager');

export interface AcquireResult {
    sandbox: SandboxInstance;
    leaseId: string;
    sandboxId: string;
    /**
     * True when this acquire cold-created a new sandbox (creator path).
     * False when it connected to an existing paused/running sandbox (joiner path).
     * Used by Phase 4 instrumentation to label sandboxState as 'cold-create' vs 'paused-resumed'.
     */
    wasCreated: boolean;
}

export interface ISandboxLeaseManager {
    /**
     * Acquire a lease on the sandbox for the given prKey. If no sandbox exists
     * yet, the manager cold-creates one using `cloneParams` (or falls back to
     * NullSandbox when `cloneParams` is omitted and no sandbox provider is
     * configured). Subsequent acquires on the same prKey return the existing
     * sandbox via warm-resume.
     */
    acquire(
        prKey: string,
        consumer: string,
        leaseTtlMs?: number,
        cloneParams?: CreateSandboxParams,
    ): Promise<AcquireResult>;
    release(leaseId: string): Promise<void>;
    invalidate(prKey: string): Promise<void>;
}

/**
 * Canonical prKey builder — produces "{organizationId}:{repositoryId}:{prNumber}".
 * Use this instead of inline template literals in webhook handlers and use-cases.
 * The pre-existing inline copies in webhook handlers are left as-is (same output).
 */
export function buildPrKey(
    organizationId: string,
    repositoryId: string,
    prNumber: number | string,
): string {
    return `${organizationId}:${repositoryId}:${prNumber}`;
}
