import { UserRequest } from '@libs/core/infrastructure/config/types/http/user-request.type';
import { AddLibraryKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/add-library-kody-rules.use-case';
import { ChangeStatusKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/change-status-kody-rules.use-case';
import { CheckSyncStatusUseCase } from '@libs/kodyRules/application/use-cases/check-sync-status.use-case';
import { CreateOrUpdateKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/create-or-update.use-case';
import { DeleteRuleInOrganizationByIdKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/delete-rule-in-organization-by-id.use-case';
import { FindByOrganizationIdKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/find-by-organization-id.use-case';
import { FindLibraryKodyRulesBucketsUseCase } from '@libs/kodyRules/application/use-cases/find-library-kody-rules-buckets.use-case';
import { FindLibraryKodyRulesWithFeedbackUseCase } from '@libs/kodyRules/application/use-cases/find-library-kody-rules-with-feedback.use-case';
import { FindLibraryKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/find-library-kody-rules.use-case';
import { FindRulesInOrganizationByRuleFilterKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/find-rules-in-organization-by-filter.use-case';
import { FindSuggestionsByRuleUseCase } from '@libs/kodyRules/application/use-cases/find-suggestions-by-rule.use-case';
import { GenerateKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/generate-kody-rules.use-case';
import { GetInheritedRulesKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/get-inherited-kody-rules.use-case';
import { GetRulesLimitStatusUseCase } from '@libs/kodyRules/application/use-cases/get-rules-limit-status.use-case';
import { ResyncRulesFromIdeUseCase } from '@libs/kodyRules/application/use-cases/resync-rules-from-ide.use-case';
import { SyncSelectedRepositoriesKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/sync-selected-repositories.use-case';
import { FastSyncIdeRulesUseCase } from '@libs/kodyRules/application/use-cases/fast-sync-ide-rules.use-case';
import { ImportFastKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/import-fast-kody-rules.use-case';
import { ImportFastKodyRulesDto } from '@libs/kodyRules/dtos/import-fast-kody-rules.dto';
import { ReviewFastKodyRulesDto } from '../dtos/review-fast-kody-rules.dto';
import { FindRecommendedKodyRulesUseCase } from '@libs/kodyRules/application/use-cases/find-recommended-kody-rules.use-case';

import {
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
    ApiQuery,
    ApiBody,
    ApiSecurity,
} from '@nestjs/swagger';
import { AddLibraryKodyRulesDto } from '@libs/kodyRules/dtos/add-library-kody-rules.dto';
import { ChangeStatusKodyRulesDTO } from '@libs/kodyRules/dtos/change-status-kody-rules.dto';
import { FindLibraryKodyRulesDto } from '../dtos/find-library-kody-rules.dto';
import { FindSuggestionsByRuleDto } from '../dtos/find-suggestions-by-rule.dto';
import { GenerateKodyRulesDTO } from '../dtos/generate-kody-rules.dto';
import { CacheService } from '@libs/core/cache/cache.service';
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
import { CreateKodyRuleDto } from '@libs/ee/kodyRules/dtos/create-kody-rule.dto';
import { KodyRulesStatus } from '@libs/kodyRules/domain/interfaces/kodyRules.interface';
import { FindRecommendedKodyRulesDto } from '../dtos/find-recommended-kody-rules.dto';
import { SyncIdeRulesDto, FastSyncIdeRulesDto } from '../dtos/kody-rules.dto';

@ApiTags('Kody Rules')
@ApiSecurity('Bearer', [])
@Controller('kody-rules')
export class KodyRulesController {
    constructor(
        private readonly createOrUpdateKodyRulesUseCase: CreateOrUpdateKodyRulesUseCase,
        private readonly findByOrganizationIdKodyRulesUseCase: FindByOrganizationIdKodyRulesUseCase,
        private readonly findRulesInOrganizationByRuleFilterKodyRulesUseCase: FindRulesInOrganizationByRuleFilterKodyRulesUseCase,
        private readonly deleteRuleInOrganizationByIdKodyRulesUseCase: DeleteRuleInOrganizationByIdKodyRulesUseCase,
        private readonly findLibraryKodyRulesUseCase: FindLibraryKodyRulesUseCase,
        private readonly findLibraryKodyRulesWithFeedbackUseCase: FindLibraryKodyRulesWithFeedbackUseCase,
        private readonly findLibraryKodyRulesBucketsUseCase: FindLibraryKodyRulesBucketsUseCase,
        private readonly findRecommendedKodyRulesUseCase: FindRecommendedKodyRulesUseCase,
        private readonly addLibraryKodyRulesUseCase: AddLibraryKodyRulesUseCase,
        private readonly generateKodyRulesUseCase: GenerateKodyRulesUseCase,
        private readonly changeStatusKodyRulesUseCase: ChangeStatusKodyRulesUseCase,
        private readonly checkSyncStatusUseCase: CheckSyncStatusUseCase,
        private readonly cacheService: CacheService,
        private readonly syncSelectedReposKodyRulesUseCase: SyncSelectedRepositoriesKodyRulesUseCase,
        private readonly getInheritedRulesKodyRulesUseCase: GetInheritedRulesKodyRulesUseCase,
        private readonly getRulesLimitStatusUseCase: GetRulesLimitStatusUseCase,
        private readonly findSuggestionsByRuleUseCase: FindSuggestionsByRuleUseCase,
        private readonly resyncRulesFromIdeUseCase: ResyncRulesFromIdeUseCase,
        private readonly fastSyncIdeRulesUseCase: FastSyncIdeRulesUseCase,
        private readonly importFastKodyRulesUseCase: ImportFastKodyRulesUseCase,
        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) { }

    @Post('/create-or-update')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Create or update Kody rule', description: 'Create a new Kody rule or update existing one' })
    @ApiResponse({ status: 200, description: 'Rule created/updated successfully' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.KodyRules,
        }),
    )
    public async create(
        @Body()
        body: CreateKodyRuleDto,
    ) {
        if (!this.request.user.organization.uuid) {
            throw new Error('Organization ID not found');
        }
        return this.createOrUpdateKodyRulesUseCase.execute(
            body,
            this.request.user.organization.uuid,
        );
    }

    @Get('/find-by-organization-id')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Find rules by organization', description: 'Get all Kody rules for the organization' })
    @ApiResponse({ status: 200, description: 'Rules retrieved successfully' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.KodyRules,
        }),
    )
    public async findByOrganizationId() {
        return this.findByOrganizationIdKodyRulesUseCase.execute();
    }

    @Get('/limits')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get rules limits status', description: 'Check organization rules usage and limits' })
    @ApiResponse({ status: 200, description: 'Limits status retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.KodyRules,
        }),
    )
    public async getRulesLimitStatus() {
        return this.getRulesLimitStatusUseCase.execute();
    }

    @Get('/suggestions')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Find suggestions by rule', description: 'Get code suggestions for a specific rule' })
    @ApiResponse({ status: 200, description: 'Suggestions retrieved' })
    @ApiQuery({ name: 'ruleId', type: 'string', example: 'rule_abc123', required: true })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.KodyRules,
        }),
    )
    public async findSuggestionsByRule(
        @Query() query: FindSuggestionsByRuleDto,
    ) {
        return this.findSuggestionsByRuleUseCase.execute(query.ruleId);
    }

    @Get('/find-rules-in-organization-by-filter')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Find rules by filter', description: 'Search rules using key-value filter' })
    @ApiResponse({ status: 200, description: 'Rules filtered successfully' })
    @ApiQuery({ name: 'key', type: 'string', example: 'status', required: true })
    @ApiQuery({ name: 'value', type: 'string', example: 'ACTIVE', required: true })
    @ApiQuery({ name: 'repositoryId', type: 'string', required: false })
    @ApiQuery({ name: 'directoryId', type: 'string', required: false })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.KodyRules,
        }),
    )
    public async findRulesInOrganizationByFilter(
        @Query('key')
        key: string,
        @Query('value')
        value: string,
        @Query('repositoryId')
        repositoryId?: string,
        @Query('directoryId')
        directoryId?: string,
    ) {
        if (!this.request.user.organization.uuid) {
            throw new Error('Organization ID not found');
        }

        return this.findRulesInOrganizationByRuleFilterKodyRulesUseCase.execute(
            this.request.user.organization.uuid,
            { [key]: value },
            repositoryId,
            directoryId,
        );
    }

    @Delete('/delete-rule-in-organization-by-id')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Delete rule by ID', description: 'Delete a Kody rule from organization' })
    @ApiResponse({ status: 200, description: 'Rule deleted successfully' })
    @ApiQuery({ name: 'ruleId', type: 'string', example: 'rule_abc123', required: true })
    @CheckPolicies(
        checkPermissions({
            action: Action.Delete,
            resource: ResourceType.KodyRules,
        }),
    )
    public async deleteRuleInOrganizationById(
        @Query('ruleId')
        ruleId: string,
    ) {
        return this.deleteRuleInOrganizationByIdKodyRulesUseCase.execute(
            ruleId,
        );
    }

    @Get('/find-library-kody-rules')
    @ApiOperation({ summary: 'Find library Kody rules', description: 'Search rules in the Kody rule library' })
    @ApiResponse({ status: 200, description: 'Library rules retrieved' })
    public async findLibraryKodyRules(@Query() query: FindLibraryKodyRulesDto) {
        return this.findLibraryKodyRulesUseCase.execute(query);
    }

    @Get('/find-library-kody-rules-with-feedback')
    @ApiOperation({ summary: 'Find library rules with feedback', description: 'Search library rules including user feedback' })
    @ApiResponse({ status: 200, description: 'Rules with feedback retrieved' })
    public async findLibraryKodyRulesWithFeedback(
        @Query() query: FindLibraryKodyRulesDto,
    ) {
        return this.findLibraryKodyRulesWithFeedbackUseCase.execute(query);
    }

    @Get('/find-library-kody-rules-buckets')
    @ApiOperation({ summary: 'Get library rules buckets', description: 'Get all available rule categories/buckets' })
    @ApiResponse({ status: 200, description: 'Buckets retrieved' })
    public async findLibraryKodyRulesBuckets() {
        return this.findLibraryKodyRulesBucketsUseCase.execute();
    }

    @Get('/find-recommended-kody-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get recommended rules', description: 'Get AI-recommended rules for organization' })
    @ApiResponse({ status: 200, description: 'Recommended rules retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.KodyRules,
        }),
    )
    public async findRecommendedKodyRules(
        @Query() query: FindRecommendedKodyRulesDto,
    ) {
        if (!this.request.user.organization.uuid) {
            throw new Error('Organization ID not found');
        }

        const limit = query.limit || 10;
        const cacheKey = `recommended-kody-rules:${this.request.user.organization.uuid}:${limit}`;

        const cachedResult = await this.cacheService.getFromCache(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }

        const result = await this.findRecommendedKodyRulesUseCase.execute(
            {
                organizationId: this.request.user.organization.uuid,
                teamId: (this.request.user as any).team?.uuid,
            },
            limit,
        );

        await this.cacheService.addToCache(cacheKey, result, 259200000);

        return result;
    }

    @Post('/add-library-kody-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Add library rules', description: 'Add rules from library to organization' })
    @ApiResponse({ status: 200, description: 'Rules added successfully' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.KodyRules,
        }),
    )
    public async addLibraryKodyRules(@Body() body: AddLibraryKodyRulesDto) {
        return this.addLibraryKodyRulesUseCase.execute(body);
    }

    @Post('/generate-kody-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Generate Kody rules', description: 'AI-generate rules based on codebase' })
    @ApiResponse({ status: 200, description: 'Rules generated successfully' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.KodyRules,
        }),
    )
    public async generateKodyRules(@Body() body: GenerateKodyRulesDTO) {
        if (!this.request.user.organization.uuid) {
            throw new Error('Organization ID not found');
        }

        return this.generateKodyRulesUseCase.execute(
            body,
            this.request.user.organization.uuid,
        );
    }

    @Post('/change-status-kody-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Change rules status', description: 'Bulk update status of multiple rules' })
    @ApiResponse({ status: 200, description: 'Rules status updated' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Update,
            resource: ResourceType.KodyRules,
        }),
    )
    public async changeStatusKodyRules(@Body() body: ChangeStatusKodyRulesDTO) {
        return this.changeStatusKodyRulesUseCase.execute(body);
    }

    @Get('/check-sync-status')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Check IDE sync status', description: 'Check synchronization status from IDE' })
    @ApiResponse({ status: 200, description: 'Sync status retrieved' })
    @ApiQuery({ name: 'teamId', type: 'string', example: 'team_123abc', required: true })
    @ApiQuery({ name: 'repositoryId', type: 'string', required: false })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.KodyRules,
        }),
    )
    public async checkSyncStatus(
        @Query('teamId')
        teamId: string,
        @Query('repositoryId')
        repositoryId?: string,
    ) {
        const cacheKey = `check-sync-status:${this.request.user.organization.uuid}:${teamId}:${repositoryId || 'no-repo'}`;

        // Tenta buscar do cache primeiro
        const cachedResult = await this.cacheService.getFromCache(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }

        // Se não estiver no cache, executa o use case
        const result = await this.checkSyncStatusUseCase.execute(
            teamId,
            repositoryId,
        );

        // Salva no cache por 15 minutos
        await this.cacheService.addToCache(cacheKey, result, 900000); // 15 minutos em milissegundos

        return result;
    }

    @Post('/sync-ide-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Sync IDE rules', description: 'Synchronize rules from IDE to server' })
    @ApiResponse({ status: 200, description: 'Sync completed' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.KodyRules,
        }),
    )
    public async syncIdeRules(
        @Body() body: SyncIdeRulesDto,
    ) {
        const respositories = [body.repositoryId];

        return this.syncSelectedReposKodyRulesUseCase.execute({
            teamId: body.teamId,
            repositoriesIds: respositories,
        });
    }

    @Post('/fast-sync-ide-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Fast sync IDE rules', description: 'Fast synchronize rules from IDE with configurable limits' })
    @ApiResponse({ status: 200, description: 'Fast sync completed' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.KodyRules,
        }),
    )
    public async fastSyncIdeRules(
        @Body()
        body: FastSyncIdeRulesDto,
    ) {
        return this.fastSyncIdeRulesUseCase.execute(body);
    }

    @Get('/pending-ide-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'List pending IDE rules', description: 'Get all pending rules from IDE' })
    @ApiResponse({ status: 200, description: 'Pending rules retrieved' })
    @ApiQuery({ name: 'teamId', type: 'string', example: 'team_123abc', required: true })
    @ApiQuery({ name: 'repositoryId', type: 'string', required: false })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.KodyRules,
        }),
    )
    public async listPendingIdeRules(
        @Query('teamId') teamId: string,
        @Query('repositoryId') repositoryId?: string,
    ) {
        const organizationId = this.request.user.organization.uuid;
        return this.findRulesInOrganizationByRuleFilterKodyRulesUseCase.execute(
            organizationId,
            { status: KodyRulesStatus.PENDING },
            repositoryId,
        );
    }

    @Post('/import-fast-ide-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Import fast IDE rules', description: 'Import rules from IDE in bulk' })
    @ApiResponse({ status: 200, description: 'Rules imported successfully' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.KodyRules,
        }),
    )
    public async importFastIdeRules(@Body() body: ImportFastKodyRulesDto) {
        return this.importFastKodyRulesUseCase.execute(body);
    }

    @Post('/review-fast-ide-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Review fast IDE rules', description: 'Activate or delete pending IDE rules' })
    @ApiResponse({ status: 200, description: 'Rules reviewed' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Update,
            resource: ResourceType.KodyRules,
        }),
    )
    public async reviewFastIdeRules(@Body() body: ReviewFastKodyRulesDto) {
        const results: any = {};

        if (body.activateRuleIds?.length) {
            results.activated = await this.changeStatusKodyRulesUseCase.execute(
                {
                    ruleIds: body.activateRuleIds,
                    status: KodyRulesStatus.ACTIVE,
                },
            );
        }

        if (body.deleteRuleIds?.length) {
            results.deleted = await this.changeStatusKodyRulesUseCase.execute({
                ruleIds: body.deleteRuleIds,
                status: KodyRulesStatus.DELETED,
            });
        }

        return results;
    }

    @Get('/inherited-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get inherited rules', description: 'Get rules inherited from parent directories' })
    @ApiResponse({ status: 200, description: 'Inherited rules retrieved' })
    @ApiQuery({ name: 'teamId', type: 'string', example: 'team_123abc', required: true })
    @ApiQuery({ name: 'repositoryId', type: 'string', example: 'repo_456def', required: true })
    @ApiQuery({ name: 'directoryId', type: 'string', required: false })
    @CheckPolicies(
        checkRepoPermissions({
            action: Action.Read,
            resource: ResourceType.KodyRules,
            repo: {
                key: {
                    query: 'repositoryId',
                },
            },
        }),
    )
    public async getInheritedRules(
        @Query('teamId') teamId: string,
        @Query('repositoryId') repositoryId: string,
        @Query('directoryId') directoryId?: string,
    ) {
        if (!this.request.user.organization.uuid) {
            throw new Error('Organization ID not found');
        }

        if (!teamId) {
            throw new Error('Team ID is required');
        }

        if (!repositoryId) {
            throw new Error('Repository ID is required');
        }

        return this.getInheritedRulesKodyRulesUseCase.execute(
            {
                organizationId: this.request.user.organization.uuid,
                teamId,
            },
            repositoryId,
            directoryId,
        );
    }

    @Post('/resync-ide-rules')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Resync IDE rules', description: 'Force resynchronization of IDE rules' })
    @ApiResponse({ status: 200, description: 'Resync completed' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.KodyRules,
        }),
    )
    public async resyncIdeRules(
        @Body() body: SyncIdeRulesDto,
    ) {
        const respositories = [body.repositoryId];

        return this.resyncRulesFromIdeUseCase.execute({
            teamId: body.teamId,
            repositoriesIds: respositories,
        });
    }
}
