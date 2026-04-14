import { Test, TestingModule } from '@nestjs/testing';
import { AstGraphBuildService } from '@libs/code-review/infrastructure/adapters/services/astGraphBuild.service';
import { AstGraphRepository } from '@libs/code-review/infrastructure/adapters/repositories/astGraph.repository';
import { RepositoryRepository } from '@libs/code-review/infrastructure/adapters/repositories/repository.repository';
import { AstGraphStatus } from '@libs/code-review/infrastructure/adapters/repositories/schemas/repository.model';
import { SandboxInstance } from '@libs/code-review/domain/contracts/sandbox.provider';

jest.mock('@kodus/flow', () => ({
    createLogger: () => ({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
    }),
}));

describe('AstGraphBuildService', () => {
    let service: AstGraphBuildService;
    let mockAstGraphRepo: jest.Mocked<AstGraphRepository>;
    let mockRepositoryRepo: jest.Mocked<RepositoryRepository>;
    let mockSandbox: jest.Mocked<SandboxInstance>;

    const REPO_ID = 'repo-123';
    const HEAD_SHA = 'abc123def456';

    const graphJson = JSON.stringify({
        nodes: [
            {
                kind: 'function',
                name: 'foo',
                qualified_name: 'src/foo.ts::foo',
                file_path: 'src/foo.ts',
                line_start: 1,
                line_end: 10,
                language: 'typescript',
                is_test: false,
            },
        ],
        edges: [
            {
                kind: 'calls',
                source_qualified: 'src/foo.ts::foo',
                target_qualified: 'src/bar.ts::bar',
                file_path: 'src/foo.ts',
                line: 5,
            },
        ],
    });

    function createMockSandbox(
        overrides: Partial<SandboxInstance> = {},
    ): jest.Mocked<SandboxInstance> {
        return {
            remoteCommands: {
                grep: jest.fn(),
                read: jest.fn(),
                listDir: jest.fn(),
            },
            cleanup: jest.fn(),
            type: 'e2b' as const,
            repoDir: '/home/user/repo',
            run: jest
                .fn()
                .mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
            readFile: jest.fn().mockResolvedValue(graphJson),
            writeFile: jest.fn().mockResolvedValue(undefined),
            ...overrides,
        } as jest.Mocked<SandboxInstance>;
    }

    beforeEach(async () => {
        mockAstGraphRepo = {
            fullRebuild: jest
                .fn()
                .mockResolvedValue({ nodeCount: 1, edgeCount: 1 }),
            incrementalUpdate: jest
                .fn()
                .mockResolvedValue({ nodeCount: 1, edgeCount: 1 }),
        } as any;

        mockRepositoryRepo = {
            updateGraphStatus: jest.fn().mockResolvedValue(undefined),
        } as any;

        mockSandbox = createMockSandbox();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AstGraphBuildService,
                { provide: AstGraphRepository, useValue: mockAstGraphRepo },
                { provide: RepositoryRepository, useValue: mockRepositoryRepo },
            ],
        }).compile();

        service = module.get<AstGraphBuildService>(AstGraphBuildService);
    });

    describe('fullBuild', () => {
        it('should call sandbox.run() for install and parse commands', async () => {
            await service.fullBuild({
                repositoryId: REPO_ID,
                sandbox: mockSandbox,
                headSha: HEAD_SHA,
            });

            // At least 2 run calls: install + parse
            expect(mockSandbox.run).toHaveBeenCalledTimes(2);

            // First call: install kodus-graph (contains "bun install")
            const installCmd = mockSandbox.run.mock.calls[0][0] as string;
            expect(installCmd).toContain('bun install');
            expect(installCmd).toContain('kodus-graph');

            // Second call: parse --all
            const parseCmd = mockSandbox.run.mock.calls[1][0] as string;
            expect(parseCmd).toContain('kodus-graph parse --all');
        });

        it('should call sandbox.readFile() to read graph JSON', async () => {
            await service.fullBuild({
                repositoryId: REPO_ID,
                sandbox: mockSandbox,
                headSha: HEAD_SHA,
            });

            expect(mockSandbox.readFile).toHaveBeenCalledWith(
                expect.stringContaining('graph.json'),
                expect.any(Object),
            );
        });

        it('should use sandbox.repoDir in commands, not hardcoded path', async () => {
            const customSandbox = createMockSandbox({
                repoDir: '/workspace/my-repo',
            });

            await service.fullBuild({
                repositoryId: REPO_ID,
                sandbox: customSandbox,
                headSha: HEAD_SHA,
            });

            // parse command should use the custom repoDir
            const parseCmd = customSandbox.run.mock.calls[1][0] as string;
            expect(parseCmd).toContain('cd /workspace/my-repo');
            expect(parseCmd).not.toContain('/home/user/repo');

            // readFile path should use custom repoDir
            const readFilePath = customSandbox.readFile.mock
                .calls[0][0] as string;
            expect(readFilePath).toContain('/workspace/my-repo');
        });

        it('should call astGraphRepo.fullRebuild() with parsed nodes/edges', async () => {
            await service.fullBuild({
                repositoryId: REPO_ID,
                sandbox: mockSandbox,
                headSha: HEAD_SHA,
            });

            expect(mockAstGraphRepo.fullRebuild).toHaveBeenCalledWith(
                REPO_ID,
                expect.arrayContaining([
                    expect.objectContaining({
                        kind: 'function',
                        name: 'foo',
                    }),
                ]),
                expect.arrayContaining([
                    expect.objectContaining({
                        kind: 'calls',
                        source_qualified: 'src/foo.ts::foo',
                    }),
                ]),
            );
        });

        it('should set status to BUILDING then READY on success', async () => {
            await service.fullBuild({
                repositoryId: REPO_ID,
                sandbox: mockSandbox,
                headSha: HEAD_SHA,
            });

            const calls = mockRepositoryRepo.updateGraphStatus.mock.calls;

            // First call: BUILDING
            expect(calls[0]).toEqual([REPO_ID, AstGraphStatus.BUILDING]);

            // Last call: READY with sha and counts
            const lastCall = calls[calls.length - 1];
            expect(lastCall[0]).toBe(REPO_ID);
            expect(lastCall[1]).toBe(AstGraphStatus.READY);
            expect(lastCall[2]).toEqual(
                expect.objectContaining({
                    sha: HEAD_SHA,
                    nodeCount: 1,
                    edgeCount: 1,
                }),
            );
        });

        it('should throw error on parse failure (exitCode !== 0)', async () => {
            mockSandbox.run
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: '',
                    exitCode: 0,
                }) // install succeeds
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: 'parse error',
                    exitCode: 1,
                }); // parse fails

            await expect(
                service.fullBuild({
                    repositoryId: REPO_ID,
                    sandbox: mockSandbox,
                    headSha: HEAD_SHA,
                }),
            ).rejects.toThrow('kodus-graph parse --all failed');

            // Should also mark as FAILED
            expect(
                mockRepositoryRepo.updateGraphStatus,
            ).toHaveBeenCalledWith(REPO_ID, AstGraphStatus.FAILED);
        });

        it('should mark status as FAILED on empty graph (0 nodes)', async () => {
            const emptyGraphJson = JSON.stringify({ nodes: [], edges: [] });
            mockSandbox.readFile.mockResolvedValue(emptyGraphJson);

            await service.fullBuild({
                repositoryId: REPO_ID,
                sandbox: mockSandbox,
                headSha: HEAD_SHA,
            });

            expect(
                mockRepositoryRepo.updateGraphStatus,
            ).toHaveBeenCalledWith(REPO_ID, AstGraphStatus.FAILED);

            // Should NOT call fullRebuild when 0 nodes
            expect(mockAstGraphRepo.fullRebuild).not.toHaveBeenCalled();
        });

        it('should mark status as FAILED on install error', async () => {
            mockSandbox.run.mockResolvedValue({
                stdout: '',
                stderr: 'network error',
                exitCode: 1,
            });

            await expect(
                service.fullBuild({
                    repositoryId: REPO_ID,
                    sandbox: mockSandbox,
                    headSha: HEAD_SHA,
                }),
            ).rejects.toThrow('kodus-graph install failed');

            expect(
                mockRepositoryRepo.updateGraphStatus,
            ).toHaveBeenCalledWith(REPO_ID, AstGraphStatus.FAILED);
        });

        it('should mark status as FAILED on readFile error', async () => {
            mockSandbox.readFile.mockRejectedValue(
                new Error('File not found'),
            );

            await expect(
                service.fullBuild({
                    repositoryId: REPO_ID,
                    sandbox: mockSandbox,
                    headSha: HEAD_SHA,
                }),
            ).rejects.toThrow('Failed to read graph file from sandbox');

            expect(
                mockRepositoryRepo.updateGraphStatus,
            ).toHaveBeenCalledWith(REPO_ID, AstGraphStatus.FAILED);
        });
    });

    describe('incrementalUpdate', () => {
        const changedFiles = ['src/foo.ts', 'src/bar.ts'];
        const newSha = 'new-sha-789';

        it('should pass changed files to kodus-graph parse --files', async () => {
            await service.incrementalUpdate({
                repositoryId: REPO_ID,
                sandbox: mockSandbox,
                changedFiles,
                newSha,
            });

            // Second run call is the parse command
            const parseCmd = mockSandbox.run.mock.calls[1][0] as string;
            expect(parseCmd).toContain('kodus-graph parse --files');
            expect(parseCmd).toContain('src/foo.ts');
            expect(parseCmd).toContain('src/bar.ts');
        });

        it('should call astGraphRepo.incrementalUpdate()', async () => {
            await service.incrementalUpdate({
                repositoryId: REPO_ID,
                sandbox: mockSandbox,
                changedFiles,
                newSha,
            });

            expect(mockAstGraphRepo.incrementalUpdate).toHaveBeenCalledWith(
                REPO_ID,
                changedFiles,
                expect.any(Array),
                expect.any(Array),
            );
        });

        it('should update status to READY on success', async () => {
            await service.incrementalUpdate({
                repositoryId: REPO_ID,
                sandbox: mockSandbox,
                changedFiles,
                newSha,
            });

            expect(
                mockRepositoryRepo.updateGraphStatus,
            ).toHaveBeenCalledWith(
                REPO_ID,
                AstGraphStatus.READY,
                expect.objectContaining({
                    sha: newSha,
                    nodeCount: 1,
                    edgeCount: 1,
                }),
            );
        });

        it('should NOT set status to FAILED on error (graph is stale but usable)', async () => {
            mockSandbox.run
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: '',
                    exitCode: 0,
                }) // install
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: 'parse error',
                    exitCode: 1,
                }); // parse fails

            await expect(
                service.incrementalUpdate({
                    repositoryId: REPO_ID,
                    sandbox: mockSandbox,
                    changedFiles,
                    newSha,
                }),
            ).rejects.toThrow('kodus-graph parse --files failed');

            // Should NOT have been called with FAILED status
            const failedCalls =
                mockRepositoryRepo.updateGraphStatus.mock.calls.filter(
                    (call) => call[1] === AstGraphStatus.FAILED,
                );
            expect(failedCalls).toHaveLength(0);
        });

        it('should use sandbox.repoDir in parse commands', async () => {
            const customSandbox = createMockSandbox({
                repoDir: '/workspace/project',
            });

            await service.incrementalUpdate({
                repositoryId: REPO_ID,
                sandbox: customSandbox,
                changedFiles,
                newSha,
            });

            const parseCmd = customSandbox.run.mock.calls[1][0] as string;
            expect(parseCmd).toContain('cd /workspace/project');
        });
    });
});
