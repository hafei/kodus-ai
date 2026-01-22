import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Inject,
    Param,
    Post,
    Query,
    Sse,
    UseGuards,
} from '@nestjs/common';
import { ExecuteDryRunDto } from '../dtos/execute-dry-run.dto';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiQuery,
    ApiSecurity,
} from '@nestjs/swagger';
import { ExecuteDryRunUseCase } from '@libs/dryRun/application/use-cases/execute-dry-run.use-case';
import { SseDryRunUseCase } from '@libs/dryRun/application/use-cases/sse-dry-run.use-case';
import { GetStatusDryRunUseCase } from '@libs/dryRun/application/use-cases/get-status-dry-run.use-case';
import { GetDryRunUseCase } from '@libs/dryRun/application/use-cases/get-dry-run.use-case';
import { ListDryRunsUseCase } from '@libs/dryRun/application/use-cases/list-dry-runs.use-case';
import { UserRequest } from '@libs/core/infrastructure/config/types/http/user-request.type';
import { REQUEST } from '@nestjs/core';
import {
    CheckPolicies,
    PolicyGuard,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import {
    checkPermissions,
    checkRepoPermissions,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';
import {
    Action,
    ResourceType,
} from '@libs/identity/domain/permissions/enums/permissions.enum';

@ApiTags('Dry Run')
@ApiSecurity('Bearer', [])
@Controller('dry-run')
export class DryRunController {
    constructor(
        private readonly executeDryRunUseCase: ExecuteDryRunUseCase,
        private readonly getStatusDryRunUseCase: GetStatusDryRunUseCase,
        private readonly sseDryRunUseCase: SseDryRunUseCase,
        private readonly getDryRunUseCase: GetDryRunUseCase,
        private readonly listDryRunsUseCase: ListDryRunsUseCase,

        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) {}

    @Post('execute')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Execute dry run', description: 'Execute code review dry run without creating comments' })
    @ApiResponse({ status: 200, description: 'Dry run execution started' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @CheckPolicies(
        checkRepoPermissions({
            action: Action.Manage,
            resource: ResourceType.CodeReviewSettings,
            repo: {
                key: {
                    body: 'repositoryId',
                },
            },
        }),
    )
    execute(
        @Body()
        body: ExecuteDryRunDto,
    ) {
        if (!this.request.user?.organization?.uuid) {
            throw new BadRequestException(
                'Organization UUID is missing in the request',
            );
        }

        const correlationId = this.executeDryRunUseCase.execute({
            organizationAndTeamData: {
                organizationId: this.request.user.organization.uuid,
                teamId: body.teamId,
            },
            repositoryId: body.repositoryId,
            prNumber: body.prNumber,
        });

        return correlationId;
    }

    @Get('status/:correlationId')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get dry run status', description: 'Check status of a dry run execution' })
    @ApiResponse({ status: 200, description: 'Status retrieved' })
    @ApiParam({ name: 'correlationId', type: 'string', example: 'correlation_abc123' })
    @ApiQuery({ name: 'teamId', type: 'string', example: 'team_456def' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Manage,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    status(
        @Param('correlationId') correlationId: string,
        @Query('teamId') teamId: string,
    ) {
        if (!this.request.user?.organization?.uuid) {
            throw new BadRequestException(
                'Organization UUID is missing in the request',
            );
        }

        return this.getStatusDryRunUseCase.execute({
            organizationAndTeamData: {
                organizationId: this.request.user.organization.uuid,
                teamId,
            },
            correlationId,
        });
    }

    @Sse('events/:correlationId')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Dry run SSE events', description: 'Server-sent events for dry run progress' })
    @ApiResponse({ status: 200, description: 'SSE connection established' })
    @ApiParam({ name: 'correlationId', type: 'string', example: 'correlation_abc123' })
    @ApiQuery({ name: 'teamId', type: 'string', example: 'team_456def' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Manage,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    events(
        @Param('correlationId') correlationId: string,
        @Query('teamId') teamId: string,
    ) {
        if (!this.request.user?.organization?.uuid) {
            throw new BadRequestException(
                'Organization UUID is missing in the request',
            );
        }

        return this.sseDryRunUseCase.execute({
            correlationId,
            organizationAndTeamData: {
                teamId,
                organizationId: this.request.user.organization.uuid,
            },
        });
    }

    @Get('')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'List dry runs', description: 'Get list of dry runs with filters' })
    @ApiResponse({ status: 200, description: 'Dry runs retrieved' })
    @ApiQuery({ name: 'teamId', type: 'string', required: true })
    @ApiQuery({ name: 'repositoryId', type: 'string', required: false })
    @ApiQuery({ name: 'directoryId', type: 'string', required: false })
    @ApiQuery({ name: 'startDate', type: 'string', required: false })
    @ApiQuery({ name: 'endDate', type: 'string', required: false })
    @ApiQuery({ name: 'prNumber', type: 'number', required: false })
    @ApiQuery({ name: 'status', type: 'string', required: false })
    @CheckPolicies(
        checkPermissions({
            action: Action.Manage,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    listDryRuns(
        @Query('teamId') teamId: string,
        @Query('repositoryId') repositoryId?: string,
        @Query('directoryId') directoryId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
        @Query('prNumber') prNumber?: string,
        @Query('status') status?: string,
    ) {
        if (!this.request.user?.organization?.uuid) {
            throw new BadRequestException(
                'Organization UUID is missing in the request',
            );
        }

        return this.listDryRunsUseCase.execute({
            organizationAndTeamData: {
                organizationId: this.request.user.organization.uuid,
                teamId,
            },
            filters: {
                repositoryId,
                directoryId,
                status,
                startDate,
                endDate,
                prNumber,
            },
        });
    }

    @Get(':correlationId')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get dry run details', description: 'Get detailed information about a dry run' })
    @ApiResponse({ status: 200, description: 'Dry run details retrieved' })
    @ApiParam({ name: 'correlationId', type: 'string', example: 'correlation_abc123' })
    @ApiQuery({ name: 'teamId', type: 'string', example: 'team_456def' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Manage,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    getDryRun(
        @Param('correlationId') correlationId: string,
        @Query('teamId') teamId: string,
    ) {
        if (!this.request.user?.organization?.uuid) {
            throw new BadRequestException(
                'Organization UUID is missing in the request',
            );
        }

        return this.getDryRunUseCase.execute({
            organizationAndTeamData: {
                organizationId: this.request.user.organization.uuid,
                teamId,
            },
            correlationId,
        });
    }
}
