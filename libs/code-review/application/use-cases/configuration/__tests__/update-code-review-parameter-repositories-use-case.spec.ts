import { UpdateCodeReviewParameterRepositoriesUseCase } from '../update-code-review-parameter-repositories-use-case';

describe('UpdateCodeReviewParameterRepositoriesUseCase', () => {
    it('updates repositories even when request.user is not available', async () => {
        const createOrUpdateParametersUseCase = {
            execute: jest.fn().mockResolvedValue({ ok: true }),
        };

        const useCase = new UpdateCodeReviewParameterRepositoriesUseCase(
            {
                findByKey: jest.fn().mockResolvedValue({
                    configValue: {
                        repositories: [
                            {
                                id: 'repo-1',
                                name: 'alpha',
                                isSelected: true,
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
                    },
                    {
                        id: 'repo-2',
                        name: 'beta',
                    },
                ]),
            } as any,
            {
                registerRepositoriesLog: jest.fn(),
            } as any,
            {} as any,
        );
        const loggerErrorSpy = jest.spyOn(useCase['logger'], 'error');

        const result = await useCase.execute({
            organizationAndTeamData: {
                organizationId: 'org-1',
                teamId: 'team-1',
            },
        });

        expect(createOrUpdateParametersUseCase.execute).toHaveBeenCalledWith(
            'code_review_config',
            {
                repositories: [
                    {
                        id: 'repo-1',
                        name: 'alpha',
                        isSelected: true,
                        configs: {},
                        directories: [],
                    },
                    {
                        id: 'repo-2',
                        name: 'beta',
                        isSelected: true,
                        configs: {},
                        directories: [],
                    },
                ],
            },
            {
                organizationId: 'org-1',
                teamId: 'team-1',
            },
        );
        expect(loggerErrorSpy).not.toHaveBeenCalled();
        expect(result).toEqual({ ok: true });
    });
});
