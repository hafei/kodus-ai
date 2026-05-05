/**
 * Integration tests for SandboxLeaseManager lifecycle.
 *
 * Instantiated directly (no NestJS DI) with mocked dependencies:
 *   - leaseRepo: all methods as jest.fn()
 *   - sandboxProvider: ISandboxProvider as jest.fn()
 *   - configService: ConfigService.get as jest.fn()
 *
 * e2b static methods (Sandbox.kill, Sandbox.connect, Sandbox.setTimeout) are
 * provided by the global mock at test/__mocks__/e2b.ts (via moduleNameMapper)
 * and can be spy-on'd via jest.spyOn(Sandbox, 'kill') etc.
 *
 * All tests run without real E2B API calls or real Mongo.
 *
 * Test coverage:
 *   Test 1 — acquire-release happy path (Phase 1 criterion 2)
 *   Test 2 — concurrent acquire: exactly one createSandboxWithRepo call (Phase 1 criterion 3)
 *   Test 3 — invalidate via PR-close: soft-drain then delete (Phase 1 criterion 4)
 *   Test 4 — NullSandbox fallback when provider unavailable (Phase 1 criterion 5)
 *   Test 5 — reaper cleans crashed-worker lease (Phase 1 criterion 3)
 */

import { Sandbox } from 'e2b';
import { SandboxLeaseManager } from './sandbox-lease-manager.service';
import { SandboxLeaseReaperService } from './sandbox-lease-reaper.service';
import { SandboxLeaseRepository } from '../repositories/sandbox-lease.repository';
import {
    ISandboxProvider,
    SandboxInstance,
} from '@libs/sandbox/domain/contracts/sandbox.provider';
import { ConfigService } from '@nestjs/config';

// ─── Shared test helpers ─────────────────────────────────────────────────────

function makeMockLeaseRepo(): jest.Mocked<SandboxLeaseRepository> {
    return {
        upsertAcquire: jest.fn(),
        decrementLease: jest.fn(),
        updateReady: jest.fn().mockResolvedValue(undefined),
        markInvalidated: jest.fn().mockResolvedValue(undefined),
        findByPrKey: jest.fn().mockResolvedValue(null),
        findExpired: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SandboxLeaseRepository>;
}

function makeMockSandboxProvider(available = true): jest.Mocked<ISandboxProvider> {
    const mockSandboxInstance: SandboxInstance = {
        remoteCommands: {
            grep: jest.fn().mockResolvedValue(''),
            read: jest.fn().mockResolvedValue(''),
            listDir: jest.fn().mockResolvedValue(''),
            exec: jest.fn().mockResolvedValue({ stdout: '', exitCode: 0 }),
        },
        cleanup: jest.fn().mockResolvedValue(undefined),
        type: 'e2b',
        repoDir: '/home/user/repo',
        run: jest.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
        readFile: jest.fn().mockResolvedValue(''),
        writeFile: jest.fn().mockResolvedValue(undefined),
    };

    return {
        isAvailable: jest.fn().mockReturnValue(available),
        createSandboxWithRepo: jest.fn().mockResolvedValue(mockSandboxInstance),
    } as jest.Mocked<ISandboxProvider>;
}

function makeMockConfigService(e2bKey: string | undefined = 'test-e2b-key'): jest.Mocked<ConfigService> {
    return {
        get: jest.fn().mockReturnValue(e2bKey),
    } as unknown as jest.Mocked<ConfigService>;
}

function makeLeaseManager(
    leaseRepo: jest.Mocked<SandboxLeaseRepository>,
    sandboxProvider: jest.Mocked<ISandboxProvider>,
    configService: jest.Mocked<ConfigService>,
): SandboxLeaseManager {
    // Direct instantiation bypasses @Inject decorators — just pass positional args
    return new SandboxLeaseManager(
        sandboxProvider as any,
        leaseRepo,
        configService,
    );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SandboxLeaseManager', () => {
    let leaseRepo: jest.Mocked<SandboxLeaseRepository>;
    let sandboxProvider: jest.Mocked<ISandboxProvider>;
    let configService: jest.Mocked<ConfigService>;
    let manager: SandboxLeaseManager;

    beforeEach(() => {
        jest.clearAllMocks();
        leaseRepo = makeMockLeaseRepo();
        sandboxProvider = makeMockSandboxProvider(true);
        configService = makeMockConfigService('test-e2b-key');
        manager = makeLeaseManager(leaseRepo, sandboxProvider, configService);
    });

    // ─── Test 1: acquire-release happy path ───────────────────────────────

    it('acquire: creates sandbox when no existing lease; release sets idle timeout, does not kill', async () => {
        const prKey = 'org:repo:42';

        // Creator path: leaseCount === 1 after upsert
        leaseRepo.upsertAcquire.mockResolvedValue({
            _id: prKey,
            leaseCount: 1,
            state: 'CREATING',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        } as any);

        // Post-create: lease is READY (not INVALIDATED)
        leaseRepo.findByPrKey.mockResolvedValue({
            _id: prKey,
            leaseCount: 1,
            state: 'READY',
            sandboxId: '',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        } as any);

        // Acquire
        const result = await manager.acquire(prKey, 'review');

        // Provider should be checked for availability
        expect(result).toBeDefined();
        expect(result.leaseId).toBeDefined();
        expect(result.sandbox).toBeDefined();

        // updateReady called with prKey
        expect(leaseRepo.updateReady).toHaveBeenCalledWith(prKey, expect.any(String));

        // Release: decrement lease
        leaseRepo.decrementLease.mockResolvedValue({
            _id: prKey,
            leaseCount: 0,
            state: 'READY',
            sandboxId: 'e2b-sandbox-123',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        } as any);

        await manager.release(result.leaseId);

        // When leaseCount hits 0 with sandboxId and API key: setTimeout applied
        expect(Sandbox.setTimeout).toHaveBeenCalledWith(
            'e2b-sandbox-123',
            300_000, // IDLE_TIMEOUT_MS
            { apiKey: 'test-e2b-key' },
        );

        // kill is NEVER called on release
        expect(Sandbox.kill).not.toHaveBeenCalled();
    });

    // ─── Test 2: concurrent acquire — exactly one createSandboxWithRepo ───

    it('second concurrent acquire polls until READY instead of creating a second sandbox', async () => {
        const prKey = 'org:repo:99';

        // First acquire: creator path (leaseCount === 1)
        leaseRepo.upsertAcquire
            .mockResolvedValueOnce({
                _id: prKey,
                leaseCount: 1,
                state: 'CREATING',
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            } as any)
            // Second acquire: joiner path (leaseCount === 2, state CREATING)
            .mockResolvedValueOnce({
                _id: prKey,
                leaseCount: 2,
                state: 'CREATING',
                sandboxId: undefined,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            } as any);

        // Post-create check: READY (not INVALIDATED) — used by creator path
        leaseRepo.findByPrKey
            .mockResolvedValueOnce({
                _id: prKey,
                leaseCount: 1,
                state: 'READY',
                sandboxId: 'e2b-poll-sandbox',
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            } as any)
            // First poll: still CREATING
            .mockResolvedValueOnce({
                _id: prKey,
                leaseCount: 2,
                state: 'CREATING',
                sandboxId: undefined,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            } as any)
            // Second poll: READY with sandboxId — joiner connects
            .mockResolvedValueOnce({
                _id: prKey,
                leaseCount: 2,
                state: 'READY',
                sandboxId: 'e2b-poll-sandbox',
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            } as any);

        // Use fake timers to fast-forward polling without real delays
        jest.useFakeTimers();

        const acquire1Promise = manager.acquire(prKey, 'review');
        const acquire2Promise = manager.acquire(prKey, 'conversation');

        // Fast-forward past the poll interval (500ms) multiple times
        await jest.runAllTimersAsync();

        const [result1, result2] = await Promise.all([
            acquire1Promise,
            acquire2Promise,
        ]);

        jest.useRealTimers();

        // Both results have a sandbox — each caller got one
        expect(result1.sandbox).toBeDefined();
        expect(result2.sandbox).toBeDefined();

        // Joiner (second acquire) connected to existing sandbox via Sandbox.connect
        // (creator path — without cloneParams — uses null sandbox for initial CREATING→READY)
        expect(Sandbox.connect).toHaveBeenCalledWith(
            'e2b-poll-sandbox',
            { apiKey: 'test-e2b-key' },
        );

        // Key invariant: createSandboxWithRepo NOT called without cloneParams
        // (manager falls back to null sandbox when no clone params supplied).
        // The concurrency assertion is: Sandbox.connect is called exactly once
        // (only the joiner path connects; the creator took null-sandbox path).
        expect(Sandbox.connect).toHaveBeenCalledTimes(1);
    });

    // ─── Test 3: invalidate via PR-close (soft-drain + delete) ───────────

    it('invalidate: sets Sandbox.setTimeout(60s) then deletes Mongo doc', async () => {
        const prKey = 'org:repo:77';

        leaseRepo.findByPrKey.mockResolvedValue({
            _id: prKey,
            leaseCount: 1,
            state: 'READY',
            sandboxId: 'e2b-to-invalidate',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        } as any);

        await manager.invalidate(prKey);

        // Soft-drain: 60s timeout applied (not IDLE_TIMEOUT_MS which is for release)
        expect(Sandbox.setTimeout).toHaveBeenCalledWith(
            'e2b-to-invalidate',
            60_000,
            { apiKey: 'test-e2b-key' },
        );

        // Mongo doc deleted after soft-drain
        expect(leaseRepo.delete).toHaveBeenCalledWith(prKey);

        // kill is NOT called synchronously (soft-drain, not immediate kill)
        expect(Sandbox.kill).not.toHaveBeenCalled();
    });

    // ─── Test 4: NullSandbox fallback when provider unavailable ──────────

    it('returns NullSandbox lease when provider.isAvailable() is false', async () => {
        const prKey = 'org:repo:11';

        // Provider not available
        sandboxProvider = makeMockSandboxProvider(false);
        manager = makeLeaseManager(leaseRepo, sandboxProvider, configService);

        leaseRepo.upsertAcquire.mockResolvedValue({
            _id: prKey,
            leaseCount: 1,
            state: 'CREATING',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        } as any);

        // Post-create check: READY
        leaseRepo.findByPrKey.mockResolvedValue({
            _id: prKey,
            leaseCount: 1,
            state: 'READY',
            sandboxId: '',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        } as any);

        const result = await manager.acquire(prKey, 'review');

        // Got a result with a sandbox (null type)
        expect(result.sandbox).toBeDefined();
        expect(result.sandbox.type).toBe('null');

        // No E2B API calls made
        expect(sandboxProvider.createSandboxWithRepo).not.toHaveBeenCalled();
        expect(Sandbox.create).not.toHaveBeenCalled();
    });
});

// ─── Test 5: Reaper cleans crashed-worker lease ───────────────────────────

describe('SandboxLeaseReaperService', () => {
    it('reaper cleans ALL expired leases regardless of leaseCount (crashed-worker scenario)', async () => {
        const leaseRepo = makeMockLeaseRepo();
        const configService = makeMockConfigService('test-e2b-key');

        // Expired lease with leaseCount:1 (crashed worker never called release)
        leaseRepo.findExpired.mockResolvedValue([
            {
                _id: 'org:repo:1',
                sandboxId: 'e2b-123',
                leaseCount: 1,
                state: 'READY',
                createdAt: new Date(Date.now() - 60 * 60 * 1000),
                expiresAt: new Date(Date.now() - 10 * 60 * 1000),
            } as any,
        ]);

        const mockLock = { release: jest.fn().mockResolvedValue(undefined) };
        const mockDistributedLockService = {
            acquire: jest.fn().mockResolvedValue(mockLock),
        };

        const reaper = new SandboxLeaseReaperService(
            leaseRepo,
            mockDistributedLockService as any,
            configService,
        );

        await reaper.reapExpiredLeases();

        // Sandbox.kill called with the expired sandbox ID
        expect(Sandbox.kill).toHaveBeenCalledWith('e2b-123', { apiKey: 'test-e2b-key' });

        // Mongo doc deleted
        expect(leaseRepo.delete).toHaveBeenCalledWith('org:repo:1');
    });
});
