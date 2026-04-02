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
import { PullRequestFileChange } from '@libs/platform/domain/platformIntegrations/interfaces/code-management.interface';

export type CentralizedMutationMode = 'direct' | 'centralized-pr';

export interface CentralizedPrMetadata {
    mode: CentralizedMutationMode;
    prUrl?: string;
    message?: string;
}

type Resolvable<T> = T | ((context: { repositoryFolder: string }) => T);

export interface CentralizedMutationPullRequestRequest {
    organizationAndTeamData: OrganizationAndTeamData;
    repositoryId?: string;
    files: Resolvable<PullRequestFileChange[]>;
    title: Resolvable<string>;
    description: Resolvable<string>;
    commitMessage: Resolvable<string>;
    sourceBranch: Resolvable<string>;
    author?: { name: string; email?: string };
    centralizedModeMessage?: string;
}

export interface BuildCentralizedPathParams {
    repositoryFolder: string;
    relativePath: string;
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
        files: PullRequestFileChange[];
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

    async createMutationPullRequestIfEnabled(
        params: CentralizedMutationPullRequestRequest,
    ): Promise<CentralizedPrMetadata> {
        const centralizedRepository =
            await this.getCentralizedRepositoryIfEnabled(
                params.organizationAndTeamData,
            );

        if (!centralizedRepository) {
            return { mode: 'direct' };
        }

        const repositoryFolder = await this.resolveRepositoryFolderName(
            params.organizationAndTeamData,
            params.repositoryId,
        );

        const context = { repositoryFolder };

        const pr = await this.createPullRequestInCentralizedRepo({
            organizationAndTeamData: params.organizationAndTeamData,
            repository: centralizedRepository,
            files: this.resolveValue(params.files, context),
            title: this.resolveValue(params.title, context),
            description: this.resolveValue(params.description, context),
            commitMessage: this.resolveValue(params.commitMessage, context),
            sourceBranch: this.resolveValue(params.sourceBranch, context),
            author: params.author,
        });

        return {
            mode: 'centralized-pr',
            prUrl: pr.prUrl,
            message:
                params.centralizedModeMessage ||
                'Centralized config is enabled. Change proposed through pull request instead of direct persistence.',
        };
    }

    buildCentralizedPath(params: BuildCentralizedPathParams): string {
        if (params.repositoryFolder === 'global') {
            return params.relativePath;
        }

        return `${params.repositoryFolder}/${params.relativePath}`;
    }

    sanitizeFileName(name?: string, fallback = 'item', maxLength = 30): string {
        const normalized = (name || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, maxLength);

        return normalized || fallback;
    }

    private resolveValue<T>(
        value: Resolvable<T>,
        context: { repositoryFolder: string },
    ): T {
        return typeof value === 'function'
            ? (value as (context: { repositoryFolder: string }) => T)(context)
            : value;
    }
}
