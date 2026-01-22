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
import { CheckHasIntegrationByPlatformUseCase } from '@libs/integrations/application/use-cases/check-has-connection.use-case';
import { CloneIntegrationUseCase } from '@libs/integrations/application/use-cases/clone-integration.use-case';
import { GetConnectionsUseCase } from '@libs/platform/application/use-cases/integrations/get-connections.use-case';
import { GetOrganizationIdUseCase } from '@libs/integrations/application/use-cases/get-organization-id.use-case';
import { TeamQueryDto } from '@libs/organization/dtos/teamId-query.dto';

@ApiTags('Integration')
@ApiSecurity('Bearer', [])
@Controller('integration')
export class IntegrationController {
    constructor(
        private readonly getOrganizationIdUseCase: GetOrganizationIdUseCase,
        private readonly cloneIntegrationUseCase: CloneIntegrationUseCase,
        private readonly checkHasIntegrationByPlatformUseCase: CheckHasIntegrationByPlatformUseCase,
        private readonly getConnectionsUseCase: GetConnectionsUseCase,
    ) {}

    @Post('/clone-integration')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Clone integration', description: 'Clone integration configuration from one team to another' })
    @ApiResponse({ status: 200, description: 'Integration cloned' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.GitSettings,
        }),
    )
    public async cloneIntegration(
        @Body()
        body: {
            teamId: string;
            teamIdClone: string;
            integrationData: { platform: string; category: string };
        },
    ) {
        return this.cloneIntegrationUseCase.execute(body);
    }

    @Get('/check-connection-platform')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Check connection platform', description: 'Check if platform integration exists' })
    @ApiResponse({ status: 200, description: 'Connection status retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.GitSettings,
        }),
    )
    public async checkHasConnectionByPlatform(@Query() query: any) {
        return this.checkHasIntegrationByPlatformUseCase.execute(query);
    }

    @Get('/organization-id')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get organization ID', description: 'Get platform organization ID' })
    @ApiResponse({ status: 200, description: 'Organization ID retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.GitSettings,
        }),
    )
    public async getOrganizationId() {
        return this.getOrganizationIdUseCase.execute();
    }

    @Get('/connections')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get connections', description: 'Get all platform connections for team' })
    @ApiResponse({ status: 200, description: 'Connections retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    public async getConnections(@Query() query: TeamQueryDto) {
        return this.getConnectionsUseCase.execute(query.teamId);
    }
}
