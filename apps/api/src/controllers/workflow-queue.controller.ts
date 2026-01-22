import {
    Controller,
    Get,
    Param,
    UseGuards,
    HttpStatus,
    HttpCode,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiParam,
    ApiSecurity,
} from '@nestjs/swagger';

import {
    Action,
    ResourceType,
} from '@libs/identity/domain/permissions/enums/permissions.enum';
import { PolicyGuard } from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import { CheckPolicies } from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import { checkPermissions } from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';
import { JOB_STATUS_SERVICE_TOKEN } from '@libs/core/workflow/domain/contracts/job-status.service.contract';
import { IJobStatusService } from '@libs/core/workflow/domain/contracts/job-status.service.contract';

@ApiTags('Workflow Queue')
@ApiSecurity('Bearer', [])
@Controller('workflow-queue')
@UseGuards(PolicyGuard)
export class WorkflowQueueController {
    constructor(
        @Inject(JOB_STATUS_SERVICE_TOKEN)
        private readonly jobStatusService: IJobStatusService,
    ) {}

    @Get('/jobs/:jobId')
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    @ApiOperation({ summary: 'Get job status', description: 'Get status of a workflow job' })
    @ApiResponse({ status: 200, description: 'Job status retrieved' })
    @ApiResponse({ status: 404, description: 'Job not found' })
    @ApiParam({ name: 'jobId', type: 'string', example: 'job_abc123' })
    @HttpCode(HttpStatus.OK)
    async getJobStatus(@Param('jobId') jobId: string) {
        const job = await this.jobStatusService.getJobStatus(jobId);

        if (!job) {
            return {
                status: HttpStatus.NOT_FOUND,
                message: 'Job not found',
            };
        }

        return {
            status: HttpStatus.OK,
            data: job,
        };
    }

    @Get('/jobs/:jobId/detail')
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    @ApiOperation({ summary: 'Get job detail', description: 'Get detailed information about a workflow job' })
    @ApiResponse({ status: 200, description: 'Job detail retrieved' })
    @ApiResponse({ status: 404, description: 'Job not found' })
    @ApiParam({ name: 'jobId', type: 'string', example: 'job_abc123' })
    @HttpCode(HttpStatus.OK)
    async getJobDetail(@Param('jobId') jobId: string) {
        const detail = await this.jobStatusService.getJobDetail(jobId);

        if (!detail) {
            return {
                status: HttpStatus.NOT_FOUND,
                message: 'Job not found',
            };
        }

        return {
            status: HttpStatus.OK,
            data: detail,
        };
    }

    @Get('/metrics')
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    @ApiOperation({ summary: 'Get queue metrics', description: 'Get workflow queue metrics' })
    @ApiResponse({ status: 200, description: 'Metrics retrieved' })
    @HttpCode(HttpStatus.OK)
    async getMetrics() {
        const metrics = await this.jobStatusService.getMetrics();

        return {
            status: HttpStatus.OK,
            data: metrics,
        };
    }
}
