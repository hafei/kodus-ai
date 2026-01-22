import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Inject,
    Patch,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiQuery,
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
import { UpdateInfoOrganizationAndPhoneDto } from '../dtos/updateInfoOrgAndPhone.dto';
import { GetOrganizationNameUseCase } from '@libs/organization/application/use-cases/organization/get-organization-name';
import { UpdateInfoOrganizationAndPhoneUseCase } from '@libs/organization/application/use-cases/organization/update-infos.use-case';
import { GetOrganizationsByDomainUseCase } from '@libs/organization/application/use-cases/organization/get-organizations-domain.use-case';
import { GetOrganizationLanguageUseCase } from '@libs/platform/application/use-cases/organization/get-organization-language.use-case';
import { CacheService } from '@libs/core/cache/cache.service';
import { UserRequest } from '@libs/core/infrastructure/config/types/http/user-request.type';
import { REQUEST } from '@nestjs/core';

@ApiTags('Organization')
@ApiSecurity('Bearer', [])
@Controller('organization')
export class OrganizationController {
    constructor(
        private readonly getOrganizationNameUseCase: GetOrganizationNameUseCase,
        private readonly getOrganizationLanguageUseCase: GetOrganizationLanguageUseCase,
        private readonly updateInfoOrganizationAndPhoneUseCase: UpdateInfoOrganizationAndPhoneUseCase,
        private readonly getOrganizationsByDomainUseCase: GetOrganizationsByDomainUseCase,
        private readonly cacheService: CacheService,
        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) {}

    @Get('/name')
    @ApiOperation({ summary: 'Get organization name', description: 'Retrieve current organization name' })
    @ApiSecurity('Bearer', [])
    @ApiResponse({ status: 200, description: 'Organization name retrieved' })
    public getOrganizationName() {
        return this.getOrganizationNameUseCase.execute();
    }

    @Patch('/update-infos')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Update organization info', description: 'Update organization name and phone' })
    @ApiSecurity('Bearer', [])
    @ApiResponse({ status: 200, description: 'Organization info updated' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Update,
            resource: ResourceType.OrganizationSettings,
        }),
    )
    public async updateInfoOrganizationAndPhone(
        @Body() body: UpdateInfoOrganizationAndPhoneDto,
    ) {
        return await this.updateInfoOrganizationAndPhoneUseCase.execute(body);
    }

    @Get('/domain')
    @ApiOperation({ summary: 'Get organizations by domain', description: 'Search organizations by domain' })
    @ApiResponse({ status: 200, description: 'Organizations retrieved' })
    @ApiQuery({ name: 'domain', type: 'string', example: 'company.com' })
    public async getOrganizationsByDomain(
        @Query('domain')
        domain: string,
    ) {
        return await this.getOrganizationsByDomainUseCase.execute(domain);
    }

    @Get('/language')
    @ApiOperation({ summary: 'Get organization language', description: 'Analyze and detect primary programming language' })
    @ApiSecurity('Bearer', [])
    @ApiResponse({ status: 200, description: 'Language detected successfully' })
    @ApiResponse({ status: 400, description: 'Invalid request parameters' })
    @ApiQuery({ name: 'teamId', type: 'string', example: 'team_123abc', required: true })
    @ApiQuery({ name: 'repositoryId', type: 'string', example: 'repo_456def', required: false })
    @ApiQuery({ name: 'sampleSize', type: 'string', example: '100', required: false })
    public async getOrganizationLanguage(
        @Query('teamId') teamId: string,
        @Query('repositoryId') repositoryId?: string,
        @Query('sampleSize') sampleSize?: string,
    ) {
        const organizationId = this.request.user?.organization?.uuid;
        if (!organizationId) {
            throw new BadRequestException(
                'Organization UUID is missing in the request',
            );
        }

        if (!teamId) {
            throw new BadRequestException('teamId is required');
        }

        const cacheKey = `organization-language:${organizationId}:${teamId}:${repositoryId ?? 'auto'}:${sampleSize ?? 'default'}`;

        const cached = await this.cacheService.getFromCache<{
            language: string | null;
        }>(cacheKey);

        if (cached) {
            return cached;
        }

        const result = await this.getOrganizationLanguageUseCase.execute({
            teamId,
            repositoryId,
            sampleSize: sampleSize ? Number(sampleSize) : undefined,
        });

        await this.cacheService.addToCache(cacheKey, result, 900000);
        return result;
    }
}
