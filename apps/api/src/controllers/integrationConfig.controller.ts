import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { GetIntegrationConfigsByIntegrationCategoryUseCase } from '@libs/integrations/application/use-cases/integrationConfig/getIntegrationConfigsByIntegrationCategory.use-case';

@ApiTags('Integration Config')
@ApiSecurity('Bearer', [])
@Controller('integration-config')
export class IntegrationConfigController {
    constructor(
        private readonly getIntegrationConfigsByIntegrationCategoryUseCase: GetIntegrationConfigsByIntegrationCategoryUseCase,
    ) {}

    @Get('/get-integration-configs-by-integration-category')
    @UseGuards(PolicyGuard)
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.GitSettings,
        }),
    )
    @ApiOperation({ summary: 'Get integration configs', description: 'Get integration configurations by category' })
    @ApiResponse({ status: 200, description: 'Configs retrieved' })
    public async getIntegrationConfigsByIntegrationCategory(
        @Query('integrationCategory') integrationCategory: string,
        @Query('teamId') teamId: string,
    ) {
        return this.getIntegrationConfigsByIntegrationCategoryUseCase.execute({
            integrationCategory,
            teamId,
        });
    }
}
