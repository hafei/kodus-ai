import { STATUS } from '@libs/core/infrastructure/config/types/database/status.type';
import { CreateRepositoriesUseCase } from '../create-repositories';

describe('CreateRepositoriesUseCase', () => {
    it('uses the explicit organizationId when request.user is not available', async () => {
        const teamService = {
            findById: jest.fn().mockResolvedValue({
                uuid: 'team-1',
                status: STATUS.ACTIVE,
            }),
            find: jest.fn().mockResolvedValue([]),
            update: jest.fn(),
        };

        const codeManagementService = {
            createOrUpdateIntegrationConfig: jest.fn().mockResolvedValue(undefined),
        };

        const useCase = new CreateRepositoriesUseCase(
            teamService as any,
            {} as any,
            { execute: jest.fn().mockResolvedValue([]) } as any,
            { execute: jest.fn().mockResolvedValue(undefined) } as any,
            codeManagementService as any,
            { execute: jest.fn() } as any,
            { execute: jest.fn().mockResolvedValue(undefined) } as any,
            {} as any,
        );

        await useCase.execute({
            organizationId: 'org-1',
            repositories: [
                {
                    id: 'repo-1',
                    name: 'alpha',
                    organizationName: 'kodus',
                    selected: true,
                },
            ],
            teamId: 'team-1',
            type: 'replace',
        });

        expect(codeManagementService.createOrUpdateIntegrationConfig)
            .toHaveBeenCalledWith({
                configKey: 'repositories',
                configValue: [
                    {
                        id: 'repo-1',
                        name: 'alpha',
                        organizationName: 'kodus',
                        selected: true,
                    },
                ],
                organizationAndTeamData: {
                    organizationId: 'org-1',
                    teamId: 'team-1',
                },
                type: 'replace',
            });
    });
});
