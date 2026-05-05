import { createLogger } from '@kodus/flow';
import {
    AcquireResult,
    ISandboxLeaseManager,
    SANDBOX_LEASE_MANAGER_TOKEN,
} from '@libs/sandbox/domain/contracts/sandbox-lease-manager.contract';
import {
    CreateSandboxParams,
    ISandboxProvider,
    SandboxInstance,
    SANDBOX_PROVIDER_TOKEN,
} from '@libs/sandbox/domain/contracts/sandbox.provider';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sandbox } from 'e2b';
import { randomUUID } from 'crypto';

import { SandboxLeaseRepository } from '../repositories/sandbox-lease.repository';
import { NULL_SANDBOX_INSTANCE } from '../providers/null-sandbox.service';

/**
 * Idle timeout applied when the last lease on a sandbox is released.
 * After this window the E2B sandbox is paused automatically (not killed).
 * 5 minutes is generous enough for a second @kody comment in the same PR
 * to reuse the warm sandbox without paying cold-start.
 */
const IDLE_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Default lease TTL: 30 minutes. The reaper will clean up any lease whose
 * expiresAt has passed — this guards against crashed-worker leaks.
 */
const DEFAULT_LEASE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * How often to poll when waiting for a concurrent creator to finish.
 */
const POLL_INTERVAL_MS = 500;

/**
 * Maximum time to wait for a CREATING sandbox to become READY.
 * Exceeding this throws SandboxCreateTimeoutError.
 */
const MAX_POLL_WAIT_MS = 30_000; // 30 seconds

/**
 * Thrown when polling for a CREATING sandbox exceeds MAX_POLL_WAIT_MS.
 * Callers should treat this as a signal to fall back to self-contained mode.
 */
export class SandboxCreateTimeoutError extends Error {
    constructor(prKey: string) {
        super(
            `SandboxLeaseManager: timed out waiting for sandbox to become READY for prKey="${prKey}"`,
        );
        this.name = 'SandboxCreateTimeoutError';
    }
}

@Injectable()
export class SandboxLeaseManager implements ISandboxLeaseManager {
    private readonly logger = createLogger(SandboxLeaseManager.name);

    /**
     * In-memory map from leaseId → prKey.
     * Acceptable for single-worker Phase 1. Multi-worker support (Redis/Mongo)
     * will replace this in a later plan when distributed release is needed.
     */
    private readonly leaseIdToPrKey = new Map<string, string>();

    constructor(
        @Inject(SANDBOX_PROVIDER_TOKEN)
        private readonly sandboxProvider: ISandboxProvider,
        private readonly leaseRepo: SandboxLeaseRepository,
        private readonly configService: ConfigService,
    ) {}

    /**
     * Acquire a lease for the given prKey, creating or reusing the sandbox.
     *
     * Concurrency semantics:
     * - leaseCount === 1 after upsertAcquire → we are the creator → call createSandboxWithRepo
     * - leaseCount >  1 and state === CREATING → another worker is creating → poll until READY
     * - leaseCount >= 1 and state === READY    → connect to existing sandbox
     * - state === INVALIDATED                  → throw immediately
     *
     * @param prKey      "{orgId}:{repoId}:{prNumber}"
     * @param consumer   Caller label for logging (e.g. 'review', 'conversation')
     * @param leaseTtlMs Lease document TTL (default 30 min); reaper cleans up expired docs
     * @param cloneParams Optional create params for plan 01-04 full pipeline integration.
     *                    In this plan acquire() calls createSandboxWithRepo only if the
     *                    provider is available; when absent the NULL_SANDBOX_INSTANCE is used.
     */
    async acquire(
        prKey: string,
        consumer: string,
        leaseTtlMs = DEFAULT_LEASE_TTL_MS,
        cloneParams?: CreateSandboxParams,
    ): Promise<AcquireResult> {
        this.logger.log({
            message: `SandboxLeaseManager: acquire prKey="${prKey}" consumer="${consumer}"`,
            context: SandboxLeaseManager.name,
            metadata: { prKey, consumer },
        });

        const doc = await this.leaseRepo.upsertAcquire(prKey, leaseTtlMs);
        const leaseId = randomUUID();

        // --- Path A: We are the creator (leaseCount === 1 after upsert) ---
        if (doc.leaseCount === 1) {
            return this.handleCreatorPath(prKey, leaseId, consumer, cloneParams);
        }

        // --- Path B: Someone else created or is creating; state determines sub-path ---
        return this.handleJoinerPath(prKey, leaseId, consumer, doc.state, doc.sandboxId);
    }

    /**
     * Release a lease. Decrements leaseCount atomically.
     * When leaseCount reaches 0, sets the E2B sandbox idle timeout to IDLE_TIMEOUT_MS
     * so it pauses after 5 minutes of inactivity (does NOT kill).
     */
    async release(leaseId: string): Promise<void> {
        const prKey = this.leaseIdToPrKey.get(leaseId);
        if (!prKey) {
            this.logger.warn({
                message: `SandboxLeaseManager: release called with unknown leaseId="${leaseId}"`,
                context: SandboxLeaseManager.name,
                metadata: { leaseId },
            });
            return;
        }

        const updated = await this.leaseRepo.decrementLease(prKey);
        this.leaseIdToPrKey.delete(leaseId);

        this.logger.log({
            message: `SandboxLeaseManager: released leaseId="${leaseId}" prKey="${prKey}" leaseCount=${updated?.leaseCount ?? 'unknown'}`,
            context: SandboxLeaseManager.name,
            metadata: { leaseId, prKey, leaseCount: updated?.leaseCount },
        });

        // When last lease released: shrink E2B idle window to IDLE_TIMEOUT_MS
        // so the sandbox pauses quickly instead of running for 45 minutes.
        if (updated && updated.leaseCount <= 0 && updated.sandboxId) {
            const apiKey = this.configService.get<string>('API_E2B_KEY');
            if (apiKey) {
                try {
                    await Sandbox.setTimeout(updated.sandboxId, IDLE_TIMEOUT_MS, { apiKey });
                    this.logger.log({
                        message: `SandboxLeaseManager: set idle timeout on sandboxId="${updated.sandboxId}"`,
                        context: SandboxLeaseManager.name,
                        metadata: { prKey, sandboxId: updated.sandboxId, idleTimeoutMs: IDLE_TIMEOUT_MS },
                    });
                } catch (err) {
                    // Non-fatal: sandbox will still time out at its original ceiling
                    this.logger.warn({
                        message: `SandboxLeaseManager: failed to set idle timeout on sandboxId="${updated.sandboxId}"`,
                        context: SandboxLeaseManager.name,
                        error: err,
                    });
                }
            }
        }
    }

    /**
     * Invalidate a lease for the given prKey, called on PR-close or force-push.
     *
     * - state === CREATING: mark as INVALIDATED; the in-flight create path will
     *   detect this and kill the sandbox after it finishes (preventing orphans).
     * - state === READY or PAUSED: soft-drain (60s setTimeout) then delete doc.
     * - doc not found: no-op (idempotent).
     */
    async invalidate(prKey: string): Promise<void> {
        this.logger.log({
            message: `SandboxLeaseManager: invalidate prKey="${prKey}"`,
            context: SandboxLeaseManager.name,
            metadata: { prKey },
        });

        const doc = await this.leaseRepo.findByPrKey(prKey);
        if (!doc) {
            // Idempotent: no lease to invalidate
            this.logger.log({
                message: `SandboxLeaseManager: invalidate no-op (doc not found) prKey="${prKey}"`,
                context: SandboxLeaseManager.name,
                metadata: { prKey },
            });
            return;
        }

        if (doc.state === 'CREATING') {
            // Mid-create race: mark as INVALIDATED so the create path can detect and kill
            await this.leaseRepo.markInvalidated(prKey);
            this.logger.log({
                message: `SandboxLeaseManager: marked INVALIDATED (mid-create) prKey="${prKey}"`,
                context: SandboxLeaseManager.name,
                metadata: { prKey },
            });
            return;
        }

        // READY or PAUSED: soft-drain then delete
        if (doc.sandboxId) {
            const apiKey = this.configService.get<string>('API_E2B_KEY');
            if (apiKey) {
                try {
                    // Give in-flight tool calls 60 seconds to finish before the sandbox dies
                    await Sandbox.setTimeout(doc.sandboxId, 60_000, { apiKey });
                    this.logger.log({
                        message: `SandboxLeaseManager: soft-drain 60s applied sandboxId="${doc.sandboxId}" prKey="${prKey}"`,
                        context: SandboxLeaseManager.name,
                        metadata: { prKey, sandboxId: doc.sandboxId },
                    });
                } catch (err) {
                    this.logger.warn({
                        message: `SandboxLeaseManager: soft-drain setTimeout failed sandboxId="${doc.sandboxId}"`,
                        context: SandboxLeaseManager.name,
                        error: err,
                    });
                }
            }
        }

        await this.leaseRepo.delete(prKey);
        this.logger.log({
            message: `SandboxLeaseManager: lease deleted after invalidation prKey="${prKey}"`,
            context: SandboxLeaseManager.name,
            metadata: { prKey },
        });
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    private async handleCreatorPath(
        prKey: string,
        leaseId: string,
        consumer: string,
        cloneParams?: CreateSandboxParams,
    ): Promise<AcquireResult> {
        this.logger.log({
            message: `SandboxLeaseManager: creator path — creating sandbox prKey="${prKey}" consumer="${consumer}"`,
            context: SandboxLeaseManager.name,
            metadata: { prKey, consumer },
        });

        try {
            let sandbox: SandboxInstance;
            let sandboxId = '';

            if (this.sandboxProvider.isAvailable() && cloneParams) {
                sandbox = await this.sandboxProvider.createSandboxWithRepo(cloneParams);
                // For E2B sandboxes the sandboxId comes from the provider result,
                // but SandboxInstance does not currently expose it directly.
                // Plan 01-04 will add sandboxId to SandboxInstance; for now use '' for
                // non-E2B providers and resolve from the connected sandbox when possible.
                sandboxId = '';
            } else {
                // No provider configured or no clone params supplied — use null sandbox
                sandbox = this.buildNullSandboxWithRelease(prKey, leaseId);
                sandboxId = '';
            }

            await this.leaseRepo.updateReady(prKey, sandboxId);

            // Check for mid-create invalidation (Pitfall 5)
            const latestDoc = await this.leaseRepo.findByPrKey(prKey);
            if (latestDoc?.state === 'INVALIDATED') {
                this.logger.warn({
                    message: `SandboxLeaseManager: sandbox created but lease was INVALIDATED mid-create prKey="${prKey}"`,
                    context: SandboxLeaseManager.name,
                    metadata: { prKey, sandboxId },
                });
                // Kill the sandbox we just created; it is orphaned
                if (sandboxId) {
                    const apiKey = this.configService.get<string>('API_E2B_KEY');
                    if (apiKey) {
                        await Sandbox.kill(sandboxId, { apiKey }).catch(() => {});
                    }
                }
                // Clean up the invalidated doc
                await this.leaseRepo.delete(prKey);
                throw new Error(
                    `SandboxLeaseManager: sandbox invalidated mid-create for prKey="${prKey}"`,
                );
            }

            this.leaseIdToPrKey.set(leaseId, prKey);

            // Wrap cleanup so callers use leaseManager.release() not sandbox.kill()
            const originalCleanup = sandbox.cleanup;
            sandbox = {
                ...sandbox,
                cleanup: async () => {
                    await this.release(leaseId);
                },
            };

            this.logger.log({
                message: `SandboxLeaseManager: sandbox READY prKey="${prKey}" consumer="${consumer}" leaseId="${leaseId}"`,
                context: SandboxLeaseManager.name,
                metadata: { prKey, consumer, leaseId, sandboxId },
            });

            return { sandbox, leaseId, sandboxId, wasCreated: true };
        } catch (err) {
            // On create failure: remove the lease doc so other callers don't poll forever
            await this.leaseRepo.delete(prKey).catch(() => {});
            throw err;
        }
    }

    private async handleJoinerPath(
        prKey: string,
        leaseId: string,
        consumer: string,
        state: string,
        sandboxId?: string,
    ): Promise<AcquireResult> {
        if (state === 'INVALIDATED') {
            throw new Error(
                `SandboxLeaseManager: sandbox invalidated for prKey="${prKey}"`,
            );
        }

        if (state === 'READY' && sandboxId) {
            return this.connectToExisting(prKey, leaseId, consumer, sandboxId);
        }

        // state === 'CREATING' (or PAUSED without sandboxId): poll until READY
        this.logger.log({
            message: `SandboxLeaseManager: joiner path — polling for READY prKey="${prKey}" consumer="${consumer}"`,
            context: SandboxLeaseManager.name,
            metadata: { prKey, consumer },
        });

        const deadline = Date.now() + MAX_POLL_WAIT_MS;
        while (Date.now() < deadline) {
            await sleep(POLL_INTERVAL_MS);
            const doc = await this.leaseRepo.findByPrKey(prKey);

            if (!doc) {
                throw new Error(
                    `SandboxLeaseManager: lease disappeared while polling for READY prKey="${prKey}"`,
                );
            }

            if (doc.state === 'INVALIDATED') {
                throw new Error(
                    `SandboxLeaseManager: sandbox invalidated for prKey="${prKey}"`,
                );
            }

            if (doc.state === 'READY' && doc.sandboxId) {
                return this.connectToExisting(prKey, leaseId, consumer, doc.sandboxId);
            }
        }

        throw new SandboxCreateTimeoutError(prKey);
    }

    private async connectToExisting(
        prKey: string,
        leaseId: string,
        consumer: string,
        sandboxId: string,
    ): Promise<AcquireResult> {
        const apiKey = this.configService.get<string>('API_E2B_KEY');

        if (!apiKey) {
            // No E2B key — return null sandbox (callers in self-contained mode)
            const sandbox = this.buildNullSandboxWithRelease(prKey, leaseId);
            this.leaseIdToPrKey.set(leaseId, prKey);
            return { sandbox, leaseId, sandboxId, wasCreated: false };
        }

        this.logger.log({
            message: `SandboxLeaseManager: connecting to existing sandbox sandboxId="${sandboxId}" prKey="${prKey}" consumer="${consumer}"`,
            context: SandboxLeaseManager.name,
            metadata: { prKey, consumer, sandboxId },
        });

        const e2bSandbox = await Sandbox.connect(sandboxId, { apiKey });

        const sandbox: SandboxInstance = this.buildSandboxInstance(e2bSandbox, prKey, leaseId);
        this.leaseIdToPrKey.set(leaseId, prKey);

        this.logger.log({
            message: `SandboxLeaseManager: connected to existing sandbox prKey="${prKey}" consumer="${consumer}" leaseId="${leaseId}"`,
            context: SandboxLeaseManager.name,
            metadata: { prKey, consumer, leaseId, sandboxId },
        });

        return { sandbox, leaseId, sandboxId, wasCreated: false };
    }

    /**
     * Build a minimal SandboxInstance wrapping an existing connected E2B sandbox.
     * This is used by the joiner path when connecting to an already-READY sandbox.
     */
    private buildSandboxInstance(e2bSandbox: Sandbox, prKey: string, leaseId: string): SandboxInstance {
        return {
            remoteCommands: {
                grep: async (pattern: string, path: string, glob?: string) => {
                    const globArg = glob ? `--glob '${glob}'` : '';
                    const result = await e2bSandbox.commands.run(
                        `rg --no-heading -n ${globArg} -e '${pattern}' '${path}' 2>/dev/null || true`,
                        { timeoutMs: 30_000 },
                    );
                    return result.stdout || '';
                },
                read: async (path: string, start: number, end: number) => {
                    const result = await e2bSandbox.commands.run(
                        `sed -n '${start},${end}p' '${path}' 2>/dev/null || true`,
                        { timeoutMs: 10_000 },
                    );
                    return result.stdout || '';
                },
                listDir: async (path: string, maxDepth: number) => {
                    const result = await e2bSandbox.commands.run(
                        `find '${path}' -maxdepth ${maxDepth} 2>/dev/null | head -200 || true`,
                        { timeoutMs: 10_000 },
                    );
                    return result.stdout || '';
                },
                exec: async (command: string) => {
                    const result = await e2bSandbox.commands.run(command, { timeoutMs: 30_000 });
                    return { stdout: result.stdout || '', exitCode: result.exitCode };
                },
            },
            cleanup: async () => {
                await this.release(leaseId);
            },
            type: 'e2b',
            repoDir: '/home/user/repo',
            run: async (command: string, opts?: { timeoutMs?: number }) => {
                const result = await e2bSandbox.commands.run(command, {
                    timeoutMs: opts?.timeoutMs ?? 30_000,
                });
                return {
                    stdout: result.stdout || '',
                    stderr: result.stderr || '',
                    exitCode: result.exitCode,
                };
            },
            readFile: async (path: string, opts?: { timeoutMs?: number }) => {
                return e2bSandbox.files.read(path, {
                    requestTimeoutMs: opts?.timeoutMs ?? 600_000,
                });
            },
            writeFile: async (path: string, content: string) => {
                await e2bSandbox.files.write(path, content);
            },
        };
    }

    /**
     * Build a null sandbox with a release-bound cleanup function.
     * Used when E2B is not configured or when connect is not needed.
     */
    private buildNullSandboxWithRelease(prKey: string, leaseId: string): SandboxInstance {
        return {
            ...NULL_SANDBOX_INSTANCE,
            cleanup: async () => {
                await this.release(leaseId);
            },
        };
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
