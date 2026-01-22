import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
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
import { FindCodeReviewSettingsLogsUseCase } from '@libs/ee/codeReviewSettingsLog/application/use-cases/find-code-review-settings-logs.use-case';
import { RegisterUserStatusLogUseCase } from '@libs/ee/codeReviewSettingsLog/application/use-cases/register-use-status-log.use-case';
import { CodeReviewSettingsLogFiltersDto } from '@libs/ee/codeReviewSettingsLog/dtos/code-review-settings-log-filters.dto';
import { UserStatusDto } from '@libs/ee/codeReviewSettingsLog/dtos/user-status-change.dto';

@ApiTags('User Log')
@ApiSecurity('Bearer', [])
@Controller('user-log')
export class CodeReviewSettingLogController {
    constructor(
        private readonly findCodeReviewSettingsLogsUseCase: FindCodeReviewSettingsLogsUseCase,
        private readonly registerUserStatusLogUseCase: RegisterUserStatusLogUseCase,
    ) {}

    @Post('/status-change')
    @ApiOperation({ summary: 'Register status change', description: 'Log user status changes' })
    @ApiResponse({ status: 200, description: 'Status change logged' })
    public async registerStatusChange(
        @Body() body: UserStatusDto,
    ): Promise<void> {
        return await this.registerUserStatusLogUseCase.execute(body);
    }

    @Get('/code-review-settings')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get code review settings logs', description: 'Get audit logs of code review settings changes' })
    @ApiResponse({ status: 200, description: 'Logs retrieved' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.Logs,
        }),
    )
    public async findCodeReviewSettingsLogs(
        @Query() filters: CodeReviewSettingsLogFiltersDto,
    ) {
        return await this.findCodeReviewSettingsLogsUseCase.execute(filters);
    }
}
