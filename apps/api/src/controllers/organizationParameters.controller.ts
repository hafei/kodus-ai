import { OrganizationParametersKey } from '@libs/core/domain/enums';
import { UserRequest } from '@libs/core/infrastructure/config/types/http/user-request.type';
import {
    Action,
    ResourceType,
} from '@libs/identity/domain/permissions/enums/permissions.enum';
import {
    CheckPolicies,
    PolicyGuard,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import { checkPermissions } from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';
import { IgnoreBotsUseCase } from '@libs/organization/application/use-cases/organizationParameters/ignore-bots.use-case';
import { CreateOrUpdateOrganizationParametersUseCase } from '@libs/organization/application/use-cases/organizationParameters/create-or-update.use-case';
import { FindByKeyOrganizationParametersUseCase } from '@libs/organization/application/use-cases/organizationParameters/find-by-key.use-case';
import {
    GetModelsByProviderUseCase,
    ModelResponse,
} from '@libs/organization/application/use-cases/organizationParameters/get-models-by-provider.use-case';
import { DeleteByokConfigUseCase } from '@libs/organization/application/use-cases/organizationParameters/delete-byok-config.use-case';
import {
    GetCockpitMetricsVisibilityUseCase,
    GET_COCKPIT_METRICS_VISIBILITY_USE_CASE_TOKEN,
} from '@libs/organization/application/use-cases/organizationParameters/get-cockpit-metrics-visibility.use-case';
import { UpdateAutoLicenseAllowedUsersUseCase } from '@libs/platform/application/use-cases/codeManagement/update-auto-license-allowed-users.use-case';
import { ICockpitMetricsVisibility } from '@libs/organization/domain/organizationParameters/interfaces/cockpit-metrics-visibility.interface';

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
import { ProviderService } from '@libs/core/infrastructure/services/providers/provider.service';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiSecurity,
} from '@nestjs/swagger';
import { CreateOrUpdateOrgParameterDto, UpdateCockpitMetricsVisibilityDto, IgnoreBotsDto, UpdateAutoLicenseAllowedUsersDto } from '../dtos/organization-parameters.dto';

@ApiTags('Organization Parameters')
@ApiSecurity('Bearer', [])
@Controller('organization-parameters')
export class OrganizationParametersController {
    constructor(
        private readonly createOrUpdateOrganizationParametersUseCase: CreateOrUpdateOrganizationParametersUseCase,
        private readonly findByKeyOrganizationParametersUseCase: FindByKeyOrganizationParametersUseCase,
        private readonly getModelsByProviderUseCase: GetModelsByProviderUseCase,
        private readonly providerService: ProviderService,
        private readonly deleteByokConfigUseCase: DeleteByokConfigUseCase,
        @Inject(GET_COCKPIT_METRICS_VISIBILITY_USE_CASE_TOKEN)
        private readonly getCockpitMetricsVisibilityUseCase: GetCockpitMetricsVisibilityUseCase,
        private readonly ignoreBotsUseCase: IgnoreBotsUseCase,
        private readonly updateAutoLicenseAllowedUsersUseCase: UpdateAutoLicenseAllowedUsersUseCase,

        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) { }

    @Post('/create-or-update')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Create or update org parameter', description: 'Manage organization parameters' })
    @ApiResponse({ status: 200, description: 'Parameter updated' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.OrganizationSettings,
        }),
    )
    public async createOrUpdate(
        @Body()
        body: CreateOrUpdateOrgParameterDto,
    ) {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new Error('Organization ID is missing from request');
        }

        return await this.createOrUpdateOrganizationParametersUseCase.execute(
            body.key,
            body.configValue,
            {
                organizationId,
            },
        );
    }

    @Get('/find-by-key')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Find org parameter by key', description: 'Get organization parameter' })
    @ApiResponse({ status: 200, description: 'Parameter retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.OrganizationSettings,
        }),
    )
    public async findByKey(@Query('key') key: OrganizationParametersKey) {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new Error('Organization ID is missing from request');
        }

        return await this.findByKeyOrganizationParametersUseCase.execute(key, {
            organizationId,
        });
    }

    @Get('/list-providers')
    @ApiOperation({ summary: 'List AI providers', description: 'Get all available AI providers' })
    @ApiResponse({ status: 200, description: 'Providers list' })
    public async listProviders() {
        const providers = this.providerService.getAllProviders();
        return {
            providers: providers.map((provider) => ({
                id: provider.id,
                name: provider.name,
                description: provider.description,
                requiresApiKey: provider.requiresApiKey,
                requiresBaseUrl: provider.requiresBaseUrl,
            })),
        };
    }

    @Get('/list-models')
    @ApiOperation({ summary: 'List AI models', description: 'Get models for a specific provider' })
    @ApiResponse({ status: 200, description: 'Models list' })
    public async listModels(
        @Query('provider') provider: string,
    ): Promise<ModelResponse> {
        return await this.getModelsByProviderUseCase.execute(provider);
    }

    @Delete('/delete-byok-config')
    @ApiOperation({ summary: 'Delete BYOK config', description: 'Remove Bring Your Own Key configuration' })
    @ApiResponse({ status: 200, description: 'Config deleted' })
    public async deleteByokConfig(
        @Query('configType') configType: 'main' | 'fallback',
    ) {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new Error('Organization ID is missing from request');
        }

        return await this.deleteByokConfigUseCase.execute(
            organizationId,
            configType,
        );
    }

    @Get('/cockpit-metrics-visibility')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get cockpit visibility', description: 'Get metrics visibility settings' })
    @ApiResponse({ status: 200, description: 'Visibility settings' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.OrganizationSettings,
        }),
    )
    public async getCockpitMetricsVisibility(): Promise<ICockpitMetricsVisibility> {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new Error('Organization ID is missing from request');
        }

        return await this.getCockpitMetricsVisibilityUseCase.execute({
            organizationId,
        });
    }

    @Post('/cockpit-metrics-visibility')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Update cockpit visibility', description: 'Update metrics visibility settings' })
    @ApiResponse({ status: 200, description: 'Visibility updated' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Update,
            resource: ResourceType.OrganizationSettings,
        }),
    )
    public async updateCockpitMetricsVisibility(
        @Body()
        body: UpdateCockpitMetricsVisibilityDto,
    ) {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new Error('Organization ID is missing from request');
        }

        return await this.createOrUpdateOrganizationParametersUseCase.execute(
            OrganizationParametersKey.COCKPIT_METRICS_VISIBILITY,
            body.config,
            {
                organizationId,
                teamId: body.teamId,
            },
        );
    }

    @Post('/ignore-bots')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Ignore bots', description: 'Configure bot ignore settings' })
    @ApiResponse({ status: 200, description: 'Settings updated' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Update,
            resource: ResourceType.OrganizationSettings,
        }),
    )
    public async ignoreBots(
        @Body()
        body: IgnoreBotsDto,
    ) {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new BadRequestException('Missing organizationId in request');
        }

        return await this.ignoreBotsUseCase.execute({
            organizationId,
            teamId: body.teamId,
        });
    }

    @Post('/auto-license/allowed-users')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Update auto-license users', description: 'Manage auto-license allowed users' })
    @ApiResponse({ status: 200, description: 'Users updated' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Update,
            resource: ResourceType.OrganizationSettings,
        }),
    )
    public async updateAutoLicenseAllowedUsers(
        @Body()
        body: UpdateAutoLicenseAllowedUsersDto,
    ) {
        const organizationId =
            body.organizationId || this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new BadRequestException('Missing organizationId in request');
        }

        return await this.updateAutoLicenseAllowedUsersUseCase.execute({
            organizationAndTeamData: {
                organizationId,
                teamId: body.teamId,
            },
            includeCurrentUser: body.includeCurrentUser,
        });
    }
}
