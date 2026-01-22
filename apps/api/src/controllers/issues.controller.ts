import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';
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
import {
    CheckPolicies,
    PolicyGuard,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import { checkPermissions } from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';
import { GetIssueByIdUseCase } from '@libs/issues/application/use-cases/get-issue-by-id.use-case';
import { GetIssuesUseCase } from '@libs/issues/application/use-cases/get-issues.use-case';
import { GetTotalIssuesUseCase } from '@libs/issues/application/use-cases/get-total-issues.use-case';
import { UpdateIssuePropertyUseCase } from '@libs/issues/application/use-cases/update-issue-property.use-case';
import { IssuesEntity } from '@libs/issues/domain/entities/issues.entity';

import { GetIssuesByFiltersDto } from '../dtos/get-issues-by-filters.dto';

@ApiTags('Issues')
@ApiSecurity('Bearer', [])
@Controller('issues')
export class IssuesController {
    constructor(
        private readonly getIssuesUseCase: GetIssuesUseCase,
        private readonly getTotalIssuesUseCase: GetTotalIssuesUseCase,
        private readonly getIssueByIdUseCase: GetIssueByIdUseCase,
        private readonly updateIssuePropertyUseCase: UpdateIssuePropertyUseCase,
    ) {}

    @Get()
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get issues', description: 'Get issues with filters' })
    @ApiResponse({ status: 200, description: 'Issues retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.Issues,
        }),
    )
    async getIssues(@Query() query: GetIssuesByFiltersDto) {
        return this.getIssuesUseCase.execute(query);
    }

    @Get('count')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Count issues', description: 'Get total count of issues' })
    @ApiResponse({ status: 200, description: 'Issues count retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.Issues,
        }),
    )
    async countIssues(@Query() query: GetIssuesByFiltersDto) {
        return await this.getTotalIssuesUseCase.execute(query);
    }

    @Get(':id')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get issue by ID', description: 'Get specific issue details' })
    @ApiResponse({ status: 200, description: 'Issue retrieved' })
    @ApiResponse({ status: 404, description: 'Issue not found' })
    @ApiParam({ name: 'id', type: 'string', example: 'issue_123abc' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.Issues,
        }),
    )
    async getIssueById(@Param('id') id: string) {
        return await this.getIssueByIdUseCase.execute(id);
    }

    @Patch(':id')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Update issue property', description: 'Update severity, label, or status of an issue' })
    @ApiResponse({ status: 200, description: 'Issue updated' })
    @ApiParam({ name: 'id', type: 'string', example: 'issue_123abc' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Update,
            resource: ResourceType.Issues,
        }),
    )
    async updateIssueProperty(
        @Param('id') id: string,
        @Body() body: { field: 'severity' | 'label' | 'status'; value: string },
    ): Promise<IssuesEntity | null> {
        return await this.updateIssuePropertyUseCase.execute(
            id,
            body.field,
            body.value,
        );
    }
}
