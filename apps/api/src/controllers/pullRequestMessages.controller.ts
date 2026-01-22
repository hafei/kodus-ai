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

import { CreateOrUpdatePullRequestMessagesUseCase } from '@libs/code-review/application/use-cases/pullRequestMessages/create-or-update-pull-request-messages.use-case';
import { FindByRepositoryOrDirectoryIdPullRequestMessagesUseCase } from '@libs/code-review/application/use-cases/pullRequestMessages/find-by-repo-or-directory.use-case';
import { UserRequest } from '@libs/core/infrastructure/config/types/http/user-request.type';
import {
    Action,
    ResourceType,
} from '@libs/identity/domain/permissions/enums/permissions.enum';
import {
    CheckPolicies,
    PolicyGuard,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import {
    checkPermissions,
    checkRepoPermissions,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';
import { IPullRequestMessages } from '@libs/code-review/domain/pullRequestMessages/interfaces/pullRequestMessages.interface';

@ApiTags('Pull Request Messages')
@ApiSecurity('Bearer', [])
@Controller('pull-request-messages')
export class PullRequestMessagesController {
    constructor(
        private readonly createOrUpdatePullRequestMessagesUseCase: CreateOrUpdatePullRequestMessagesUseCase,
        private readonly findByRepositoryOrDirectoryIdPullRequestMessagesUseCase: FindByRepositoryOrDirectoryIdPullRequestMessagesUseCase,

        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) {}

    @Post('/')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Create or update PR messages', description: 'Manage PR message settings' })
    @ApiResponse({ status: 200, description: 'Messages updated' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.CodeReviewSettings,
        }),
    )
    public async createOrUpdatePullRequestMessages(
        @Body() body: IPullRequestMessages,
    ) {
        return await this.createOrUpdatePullRequestMessagesUseCase.execute(
            this.request.user,
            body,
        );
    }

    @Get('/find-by-repository-or-directory')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get PR messages', description: 'Get PR messages for repository or directory' })
    @ApiResponse({ status: 200, description: 'Messages retrieved' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @ApiQuery({ name: 'repositoryId', type: 'string', required: true })
    @ApiQuery({ name: 'directoryId', type: 'string', required: false })
    @CheckPolicies(
        checkRepoPermissions({
            action: Action.Read,
            resource: ResourceType.CodeReviewSettings,
            repo: {
                key: {
                    query: 'repositoryId',
                },
            },
        }),
    )
    public async findByRepoOrDirectoryId(
        @Query('repositoryId') repositoryId: string,
        @Query('directoryId') directoryId?: string,
    ) {
        const organizationId = this.request?.user?.organization?.uuid;

        if (!organizationId) {
            throw new Error('Organization ID is missing from request');
        }

        return await this.findByRepositoryOrDirectoryIdPullRequestMessagesUseCase.execute(
            organizationId,
            repositoryId,
            directoryId,
        );
    }
}
