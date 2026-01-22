import { UserRequest } from '@libs/core/infrastructure/config/types/http/user-request.type';
import { BackfillHistoricalPRsUseCase } from '@libs/platformData/application/use-cases/pullRequests/backfill-historical-prs.use-case';
import { GetEnrichedPullRequestsUseCase } from '@libs/code-review/application/use-cases/dashboard/get-enriched-pull-requests.use-case';
import {
    Action,
    ResourceType,
} from '@libs/identity/domain/permissions/enums/permissions.enum';
import {
    Body,
    Controller,
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
    ApiSecurity,
} from '@nestjs/swagger';
import { BackfillPRsDto } from '../dtos/backfill-prs.dto';
import { EnrichedPullRequestsQueryDto } from '@libs/code-review/dtos/dashboard/enriched-pull-requests-query.dto';
import { PaginatedEnrichedPullRequestsResponse } from '@libs/code-review/dtos/dashboard/paginated-enriched-pull-requests.dto';
import { OnboardingReviewModeSignalsQueryDto } from '../dtos/onboarding-review-mode-signals-query.dto';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import {
    IPullRequestsService,
    PULL_REQUESTS_SERVICE_TOKEN,
} from '@libs/platformData/domain/pullRequests/contracts/pullRequests.service.contracts';
import {
    CheckPolicies,
    PolicyGuard,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import { checkPermissions } from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';

@ApiTags('Pull Requests')
@ApiSecurity('Bearer', [])
@Controller('pull-requests')
export class PullRequestController {
    constructor(
        private readonly getEnrichedPullRequestsUseCase: GetEnrichedPullRequestsUseCase,
        private readonly codeManagementService: CodeManagementService,
        private readonly backfillHistoricalPRsUseCase: BackfillHistoricalPRsUseCase,
        @Inject(REQUEST)
        private readonly request: UserRequest,
        @Inject(PULL_REQUESTS_SERVICE_TOKEN)
        private readonly pullRequestsService: IPullRequestsService,
    ) {}

    @Get('/executions')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get PR executions', description: 'Get enriched pull request executions with pagination' })
    @ApiResponse({ status: 200, description: 'PR executions retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.PullRequests,
        }),
    )
    public async getPullRequestExecutions(
        @Query() query: EnrichedPullRequestsQueryDto,
    ): Promise<PaginatedEnrichedPullRequestsResponse> {
        return await this.getEnrichedPullRequestsUseCase.execute(query);
    }

    @Get('/onboarding-signals')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get onboarding signals', description: 'Get signals for PR onboarding review mode' })
    @ApiResponse({ status: 200, description: 'Onboarding signals retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.PullRequests,
        }),
    )
    public async getOnboardingSignals(
        @Query() query: OnboardingReviewModeSignalsQueryDto,
    ) {
        const organizationId = this.request.user?.organization?.uuid;
        if (!organizationId) {
            throw new Error('No organization found in request');
        }

        const { teamId, repositoryIds, limit } = query;

        const organizationAndTeamData = {
            organizationId,
            teamId,
        };

        return this.pullRequestsService.getOnboardingReviewModeSignals({
            organizationAndTeamData,
            repositoryIds,
            limit,
        });
    }

    // NOT USED IN WEB - INTERNAL USE ONLY
    @Post('/backfill')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Backfill historical PRs', description: 'Internal: Backfill historical pull requests' })
    @ApiResponse({ status: 200, description: 'Backfill initiated' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.PullRequests,
        }),
    )
    public async backfillHistoricalPRs(@Body() body: BackfillPRsDto) {
        const { teamId, repositoryIds, startDate, endDate } = body;
        const organizationId = this.request.user?.organization?.uuid;

        const organizationAndTeamData = {
            organizationId,
            teamId,
        };

        let repositories = await this.codeManagementService.getRepositories({
            organizationAndTeamData,
        });

        if (!repositories || repositories.length === 0) {
            return {
                success: false,
                message: 'No repositories found',
            };
        }

        repositories = repositories.filter(
            (r: any) => r && (r.selected === true || r.isSelected === true),
        );

        if (repositoryIds && repositoryIds.length > 0) {
            repositories = repositories.filter(
                (r: any) =>
                    repositoryIds.includes(r.id) ||
                    repositoryIds.includes(String(r.id)),
            );
        }

        if (repositories.length === 0) {
            return {
                success: false,
                message: 'No selected repositories found',
            };
        }

        setImmediate(() => {
            this.backfillHistoricalPRsUseCase
                .execute({
                    organizationAndTeamData,
                    repositories: repositories.map((r: any) => ({
                        id: String(r.id),
                        name: r.name,
                        fullName:
                            r.fullName ||
                            r.full_name ||
                            `${r.organizationName || ''}/${r.name}`,
                    })),
                    startDate,
                    endDate,
                })
                .catch((error) => {
                    console.error('Error during manual PR backfill:', error);
                });
        });

        return {
            success: true,
            message: 'PR backfill started in background',
            repositoriesCount: repositories.length,
        };
    }
}
