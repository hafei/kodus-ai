import { createLogger } from '@kodus/flow';
import { Inject, Injectable } from '@nestjs/common';

import { IntegrationConfigKey, ParametersKey } from '@libs/core/domain/enums';
import { OrganizationAndTeamData } from '@libs/core/infrastructure/config/types/general/organizationAndTeamData';
import {
    IIntegrationConfigService,
    INTEGRATION_CONFIG_SERVICE_TOKEN,
} from '@libs/integrations/domain/integrationConfigs/contracts/integration-config.service.contracts';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@libs/organization/domain/parameters/contracts/parameters.service.contract';
import { Repositories } from '@libs/platform/domain/platformIntegrations/types/codeManagement/repositories.type';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';

export type CentralizedMutationMode = 'direct' | 'centralized-pr';

export interface CentralizedPrMetadata {
    mode: CentralizedMutationMode;
    prUrl?: string;
    message?: string;
}

@Injectable()
export class CentralizedConfigPrService {
    private readonly logger = createLogger(CentralizedConfigPrService.name);

    constructor(
        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,
        @Inject(INTEGRATION_CONFIG_SERVICE_TOKEN)
        private readonly integrationConfigService: IIntegrationConfigService,
        private readonly codeManagementService: CodeManagementService,
    ) {}

    async getCentralizedRepositoryIfEnabled(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<{ id: string; name: string } | null> {
        if (!organizationAndTeamData.teamId) {
            return null;
        }

        const centralizedConfig = await this.parametersService.findByKey(
            ParametersKey.CENTRALIZED_CONFIG,
            organizationAndTeamData,
        );

        if (!centralizedConfig?.configValue?.enabled) {
            return null;
        }

        const centralizedRepository = centralizedConfig.configValue.repository;

        if (!centralizedRepository?.id || !centralizedRepository?.name) {
            throw new Error(
                'Centralized config is enabled, but no centralized repository is configured',
            );
        }

        return {
            id: centralizedRepository.id,
            name: centralizedRepository.name,
        };
    }

    async createPullRequestInCentralizedRepo(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { id: string; name: string };
        files: { path: string; content: string }[];
        title: string;
        description: string;
        commitMessage: string;
        sourceBranch: string;
        author?: { name: string; email?: string };
    }): Promise<{ prUrl: string }> {
        const pr = await this.codeManagementService.createPullRequestWithFiles({
            organizationAndTeamData: params.organizationAndTeamData,
            repository: params.repository,
            files: params.files,
            title: params.title,
            description: params.description,
            commitMessage: params.commitMessage,
            sourceBranch: params.sourceBranch,
            author: params.author || {
                name: 'kody',
                email: 'kody@kodus.io',
            },
        });

        if (!pr?.prURL) {
            this.logger.error({
                message:
                    'Failed to create pull request for centralized configuration mutation',
                context: CentralizedConfigPrService.name,
                metadata: {
                    organizationAndTeamData: params.organizationAndTeamData,
                    repository: params.repository,
                    title: params.title,
                    files: params.files.map((file) => file.path),
                },
            });

            throw new Error(
                'Failed to create pull request for centralized configuration mutation',
            );
        }

        return { prUrl: pr.prURL };
    }

    async resolveRepositoryFolderName(
        organizationAndTeamData: OrganizationAndTeamData,
        repositoryId?: string,
    ): Promise<string> {
        if (!repositoryId || repositoryId === 'global') {
            return 'global';
        }

        const repositories =
            await this.integrationConfigService.findIntegrationConfigFormatted<
                Repositories[]
            >(IntegrationConfigKey.REPOSITORIES, organizationAndTeamData);

        const found = repositories?.find((repo) => repo.id === repositoryId);
        return found?.name || repositoryId;
    }
}
