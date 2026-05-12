import { REQUEST } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { ResyncRulesFromIdeUseCase } from '@libs/kodyRules/application/use-cases/resync-rules-from-ide.use-case';
import { KodyRulesSyncService } from '@libs/kodyRules/infrastructure/adapters/services/kodyRulesSync.service';
import { NotificationService } from '@libs/notifications/application/notification.service';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';

jest.mock('@kodus/flow', () => ({
    createLogger: () => ({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    }),
}));

describe('ResyncRulesFromIdeUseCase', () => {
    let useCase: ResyncRulesFromIdeUseCase;
    let kodyRulesSyncServiceMock: { syncRepositoryMain: jest.Mock };
    let codeManagementServiceMock: { getRepositories: jest.Mock };
    let notificationServiceMock: { emit: jest.Mock };

    beforeEach(async () => {
        kodyRulesSyncServiceMock = {
            syncRepositoryMain: jest.fn().mockResolvedValue(undefined),
        };

        codeManagementServiceMock = {
            getRepositories: jest.fn().mockResolvedValue([
                {
                    id: 'repo-1',
                    name: 'backend-services',
                    fullName: 'quintoandar/backend-services',
                    selected: true,
                    default_branch: 'main',
                },
            ]),
        };

        notificationServiceMock = {
            emit: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ResyncRulesFromIdeUseCase,
                {
                    provide: KodyRulesSyncService,
                    useValue: kodyRulesSyncServiceMock,
                },
                {
                    provide: CodeManagementService,
                    useValue: codeManagementServiceMock,
                },
                {
                    provide: NotificationService,
                    useValue: notificationServiceMock,
                },
                {
                    provide: REQUEST,
                    useValue: {
                        user: {
                            uuid: 'user-1',
                            organization: {
                                uuid: 'org-1',
                            },
                        },
                    },
                },
            ],
        }).compile();

        useCase = module.get(ResyncRulesFromIdeUseCase);
    });

    it('passes an optional path to manual IDE resync', async () => {
        await useCase.execute({
            teamId: 'team-1',
            repositoriesIds: ['repo-1'],
            path: 'qantilever/.cursor/rules/logging.mdc',
        });

        expect(
            kodyRulesSyncServiceMock.syncRepositoryMain,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationAndTeamData: {
                    organizationId: 'org-1',
                    teamId: 'team-1',
                },
                repository: expect.objectContaining({
                    id: 'repo-1',
                    name: 'backend-services',
                }),
                path: 'qantilever/.cursor/rules/logging.mdc',
            }),
        );
    });
});
