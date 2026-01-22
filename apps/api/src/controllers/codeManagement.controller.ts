import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Inject,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiSecurity,
} from '@nestjs/swagger';
import { UserRequest } from '@libs/core/infrastructure/config/types/http/user-request.type';
import {
    CheckPolicies,
    PolicyGuard,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import {
    Action,
    ResourceType,
} from '@libs/identity/domain/permissions/enums/permissions.enum';
import {
    checkPermissions,
    checkRepoPermissions,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';
import { Repository } from '@libs/core/infrastructure/config/types/general/codeReview.type';
import { PullRequestState } from '@libs/core/domain/enums';
import { GetCodeManagementMemberListUseCase } from '@libs/platform/application/use-cases/codeManagement/get-code-management-members-list.use-case';
import { CreateIntegrationUseCase } from '@libs/platform/application/use-cases/codeManagement/create-integration.use-case';
import { CreateRepositoriesUseCase } from '@libs/platform/application/use-cases/codeManagement/create-repositories';
import { GetRepositoriesUseCase } from '@libs/platform/application/use-cases/codeManagement/get-repositories';
import { GetPRsUseCase } from '@libs/platform/application/use-cases/codeManagement/get-prs.use-case';
import { FinishOnboardingUseCase } from '@libs/platform/application/use-cases/codeManagement/finish-onboarding.use-case';
import { DeleteIntegrationUseCase } from '@libs/platform/application/use-cases/codeManagement/delete-integration.use-case';
import { DeleteIntegrationAndRepositoriesUseCase } from '@libs/platform/application/use-cases/codeManagement/delete-integration-and-repositories.use-case';
import { GetRepositoryTreeByDirectoryUseCase } from '@libs/platform/application/use-cases/codeManagement/get-repository-tree-by-directory.use-case';
import { GetPRsByRepoUseCase } from '@libs/platform/application/use-cases/codeManagement/get-prs-repo.use-case';
import { GetWebhookStatusUseCase } from '@libs/platform/application/use-cases/codeManagement/get-webhook-status.use-case';
import { SearchCodeManagementUsersUseCase } from '@libs/platform/application/use-cases/codeManagement/search-code-management-users.use-case';
import { GetCurrentCodeManagementUserUseCase } from '@libs/platform/application/use-cases/codeManagement/get-current-code-management-user.use-case';
import { FinishOnboardingDTO } from '@libs/platform/dtos/finish-onboarding.dto';
import { GetRepositoryTreeByDirectoryDto } from '@libs/platform/dtos/get-repository-tree-by-directory.dto';
import { WebhookStatusQueryDto } from '../dtos/webhook-status-query.dto';

@ApiTags('Code Management')
@ApiSecurity('Bearer', [])
@Controller('code-management')
export class CodeManagementController {
    constructor(
        private readonly getCodeManagementMemberListUseCase: GetCodeManagementMemberListUseCase,
        private readonly createIntegrationUseCase: CreateIntegrationUseCase,
        private readonly createRepositoriesUseCase: CreateRepositoriesUseCase,
        private readonly getRepositoriesUseCase: GetRepositoriesUseCase,
        private readonly getPRsUseCase: GetPRsUseCase,
        private readonly finishOnboardingUseCase: FinishOnboardingUseCase,
        private readonly deleteIntegrationUseCase: DeleteIntegrationUseCase,
        private readonly deleteIntegrationAndRepositoriesUseCase: DeleteIntegrationAndRepositoriesUseCase,
        private readonly getRepositoryTreeByDirectoryUseCase: GetRepositoryTreeByDirectoryUseCase,
        private readonly getPRsByRepoUseCase: GetPRsByRepoUseCase,
        private readonly getWebhookStatusUseCase: GetWebhookStatusUseCase,
        private readonly searchCodeManagementUsersUseCase: SearchCodeManagementUsersUseCase,
        private readonly getCurrentCodeManagementUserUseCase: GetCurrentCodeManagementUserUseCase,

        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) {}

    @Get('/repositories/org')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get repositories', description: 'Get repositories for organization' })
    @ApiResponse({ status: 200, description: 'Repositories retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    public async getRepositories(
        @Query()
        query: {
            teamId: string;
            organizationSelected: any;
            isSelected?: boolean;
            page?: number;
            perPage?: number;
        },
    ) {
        return this.getRepositoriesUseCase.execute(query);
    }

    @Post('/auth-integration')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Authorize integration', description: 'Authorize platform integration with token' })
    @ApiResponse({ status: 200, description: 'Integration authorized' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.GitSettings,
        }),
    )
    public async authIntegrationToken(@Body() body: any) {
        return this.createIntegrationUseCase.execute(body);
    }

    @Post('/repositories')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Create repositories', description: 'Add repositories to team' })
    @ApiResponse({ status: 200, description: 'Repositories created' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    public async createRepositories(
        @Body()
        body: {
            repositories: Repository[];
            teamId: string;
            type?: 'replace' | 'append';
        },
    ) {
        return this.createRepositoriesUseCase.execute(body);
    }

    @Get('/organization-members')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get organization members', description: 'Get all members from platform' })
    @ApiResponse({ status: 200, description: 'Members retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.UserSettings,
        }),
    )
    public async getOrganizationMembers() {
        return this.getCodeManagementMemberListUseCase.execute();
    }

    @Get('/get-prs')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get PRs', description: 'Get pull requests by filters' })
    @ApiResponse({ status: 200, description: 'PRs retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.PullRequests,
        }),
    )
    public async getPRs(
        @Query()
        query: {
            teamId: string;
            number?: number;
            title: string;
            url?: string;
        },
    ) {
        return await this.getPRsUseCase.execute({
            teamId: query.teamId,
            number: query.number,
            title: query.title,
            url: query.url,
        });
    }

    @Get('/get-prs-repo')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get PRs by repository', description: 'Get pull requests for a repository' })
    @ApiResponse({ status: 200, description: 'PRs retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.PullRequests,
        }),
    )
    public async getPRsByRepo(
        @Query()
        query: {
            teamId: string;
            repositoryId: string;
            number?: number;
            startDate?: string;
            endDate?: string;
            author?: string;
            branch?: string;
            title?: string;
            state?: PullRequestState;
        },
    ) {
        const { teamId, repositoryId, ...filters } = query;
        return await this.getPRsByRepoUseCase.execute({
            teamId,
            repositoryId,
            filters,
        });
    }

    @Post('/finish-onboarding')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Finish onboarding', description: 'Complete onboarding process' })
    @ApiResponse({ status: 200, description: 'Onboarding completed' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    public async onboardingReviewPR(
        @Body()
        body: FinishOnboardingDTO,
    ) {
        return await this.finishOnboardingUseCase.execute(body);
    }

    @Delete('/delete-integration')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Delete integration', description: 'Remove platform integration' })
    @ApiResponse({ status: 200, description: 'Integration deleted' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Delete,
            resource: ResourceType.GitSettings,
        }),
    )
    public async deleteIntegration(@Query() query: { teamId: string }) {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new BadRequestException(
                'organizationId not found in request',
            );
        }

        return await this.deleteIntegrationUseCase.execute({
            organizationId,
            teamId: query.teamId,
        });
    }

    @Delete('/delete-integration-and-repositories')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Delete integration and repos', description: 'Remove integration and all repositories' })
    @ApiResponse({ status: 200, description: 'Integration and repos deleted' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Delete,
            resource: ResourceType.GitSettings,
        }),
    )
    public async deleteIntegrationAndRepositories(
        @Query() query: { teamId: string },
    ) {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new BadRequestException(
                'organizationId not found in request',
            );
        }

        return await this.deleteIntegrationAndRepositoriesUseCase.execute({
            organizationId,
            teamId: query.teamId,
        });
    }

    @Get('/get-repository-tree-by-directory')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get repository tree', description: 'Get directory structure of repository' })
    @ApiResponse({ status: 200, description: 'Tree retrieved' })
    @CheckPolicies(
        checkRepoPermissions({
            action: Action.Read,
            resource: ResourceType.CodeReviewSettings,
            repo: {
                key: { query: 'repositoryId' },
            },
        }),
    )
    public async getRepositoryTreeByDirectory(
        @Query() query: GetRepositoryTreeByDirectoryDto,
    ) {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new BadRequestException(
                'organizationId not found in request',
            );
        }

        return await this.getRepositoryTreeByDirectoryUseCase.execute({
            ...query,
            organizationId,
        });
    }

    @Get('/search-users')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Search users', description: 'Search for platform users' })
    @ApiResponse({ status: 200, description: 'Users retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.UserSettings,
        }),
    )
    public async searchUsers(
        @Query()
        query: {
            organizationId: string;
            teamId?: string;
            q?: string;
            userId?: string;
            limit?: number;
        },
    ) {
        return await this.searchCodeManagementUsersUseCase.execute({
            organizationId: query.organizationId,
            teamId: query.teamId,
            query: query.q,
            userId: query.userId,
            limit: query.limit ? Number(query.limit) : undefined,
        });
    }

    @Get('/current-user')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get current user', description: 'Get current platform user info' })
    @ApiResponse({ status: 200, description: 'User info retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.UserSettings,
        }),
    )
    public async getCurrentUser(
        @Query()
        query: {
            organizationId: string;
            teamId?: string;
        },
    ) {
        return await this.getCurrentCodeManagementUserUseCase.execute({
            organizationId: query.organizationId,
            teamId: query.teamId,
        });
    }

    // NOT USED IN WEB - INTERNAL USE ONLY
    @Get('/webhook-status')
    @ApiOperation({ summary: 'Get webhook status', description: 'Internal: Check webhook status' })
    @ApiResponse({ status: 200, description: 'Webhook status' })
    public async getWebhookStatus(
        @Query() query: WebhookStatusQueryDto,
    ): Promise<{ active: boolean }> {
        return this.getWebhookStatusUseCase.execute({
            organizationAndTeamData: {
                organizationId: query.organizationId,
                teamId: query.teamId,
            },
            repositoryId: query.repositoryId,
        });
    }
}
