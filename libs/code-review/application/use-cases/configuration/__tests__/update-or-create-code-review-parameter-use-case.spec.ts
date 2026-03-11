import { UpdateOrCreateCodeReviewParameterUseCase } from '../update-or-create-code-review-parameter-use-case';

describe('UpdateOrCreateCodeReviewParameterUseCase', () => {
    it('creates repository settings without request.user when invoked by CLI', async () => {
        const createOrUpdateParametersUseCase = {
            execute: jest.fn().mockResolvedValue(true),
        };

        const authorizationService = {
            ensure: jest.fn(),
        };

        const useCase = new UpdateOrCreateCodeReviewParameterUseCase(
            {
                findByKey: jest.fn().mockResolvedValue({
                    configValue: {
                        id: 'global',
                        name: 'Global',
                        isSelected: true,
                        configs: {},
                        repositories: [
                            {
                                id: 'repo-1',
                                name: 'alpha',
                                isSelected: false,
                                configs: {},
                                directories: [],
                            },
                        ],
                    },
                }),
            } as any,
            createOrUpdateParametersUseCase as any,
            {
                findIntegrationConfigFormatted: jest.fn().mockResolvedValue([
                    {
                        id: 'repo-1',
                        name: 'alpha',
                        directories: [],
                    },
                ]),
            } as any,
            {
                registerCodeReviewConfigLog: jest.fn(),
            } as any,
            {} as any,
            authorizationService as any,
            {
                detectAndSaveReferences: jest.fn(),
            } as any,
            {
                buildConfigKey: jest.fn().mockReturnValue('config-key'),
            } as any,
        );

        const result = await useCase.execute({
            actor: {
                source: 'cli',
            },
            configValue: {},
            organizationAndTeamData: {
                organizationId: 'org-1',
                teamId: 'team-1',
            },
            repositoryId: 'repo-1',
            skipAuthorization: true,
        } as any);

        expect(authorizationService.ensure).not.toHaveBeenCalled();
        expect(createOrUpdateParametersUseCase.execute).toHaveBeenCalledWith(
            'code_review_config',
            expect.objectContaining({
                repositories: [
                    expect.objectContaining({
                        id: 'repo-1',
                        isSelected: true,
                    }),
                ],
            }),
            {
                organizationId: 'org-1',
                teamId: 'team-1',
            },
        );
        expect(result).toBe(true);
    });

    it('does not crash when authorization runs without an HTTP request object', async () => {
        const createOrUpdateParametersUseCase = {
            execute: jest.fn().mockResolvedValue(true),
        };

        const authorizationService = {
            ensure: jest.fn().mockResolvedValue(undefined),
        };

        const useCase = new UpdateOrCreateCodeReviewParameterUseCase(
            {
                findByKey: jest.fn().mockResolvedValue({
                    configValue: {
                        id: 'global',
                        name: 'Global',
                        isSelected: true,
                        configs: {},
                        repositories: [
                            {
                                id: 'repo-1',
                                name: 'alpha',
                                isSelected: false,
                                configs: {},
                                directories: [],
                            },
                        ],
                    },
                }),
            } as any,
            createOrUpdateParametersUseCase as any,
            {
                findIntegrationConfigFormatted: jest.fn().mockResolvedValue([
                    {
                        id: 'repo-1',
                        name: 'alpha',
                        directories: [],
                    },
                ]),
            } as any,
            {
                emit: jest.fn(),
            } as any,
            undefined as any,
            authorizationService as any,
            {
                detectAndSaveReferences: jest.fn(),
            } as any,
            {
                buildConfigKey: jest.fn().mockReturnValue('config-key'),
            } as any,
        );

        await expect(
            useCase.execute({
                configValue: {},
                organizationAndTeamData: {
                    organizationId: 'org-1',
                    teamId: 'team-1',
                },
                repositoryId: 'repo-1',
            } as any),
        ).resolves.toBe(true);

        expect(authorizationService.ensure).toHaveBeenCalledWith({
            user: undefined,
            action: 'create',
            resource: 'code_review_settings',
            repoIds: ['repo-1'],
        });
    });
});
