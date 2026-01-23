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
    ApiQuery,
} from '@nestjs/swagger';

import { AssignReposUseCase } from '@libs/identity/application/use-cases/permissions/assign-repos.use-case';
import { CanAccessUseCase } from '@libs/identity/application/use-cases/permissions/can-access.use-case';
import { GetAssignedReposUseCase } from '@libs/identity/application/use-cases/permissions/get-assigned-repos.use-case';
import { GetPermissionsUseCase } from '@libs/identity/application/use-cases/permissions/get-permissions.use-case';
import {
    Action,
    ResourceType,
} from '@libs/identity/domain/permissions/enums/permissions.enum';
import { IUser } from '@libs/identity/domain/user/interfaces/user.interface';
import {
    CheckPolicies,
    PolicyGuard,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import { checkPermissions } from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';
import { createLogger } from '@kodus/flow';
import { AssignReposDto } from '../dtos/permissions.dto';

@ApiTags('Permissions')
@ApiSecurity('Bearer', [])
@Controller('permissions')
export class PermissionsController {
    private readonly logger = createLogger(PermissionsController.name);

    constructor(
        @Inject(REQUEST)
        private readonly request: Request & {
            user: Partial<IUser>;
        },

        private readonly getPermissionsUseCase: GetPermissionsUseCase,
        private readonly canAccessUseCase: CanAccessUseCase,
        private readonly getAssignedReposUseCase: GetAssignedReposUseCase,
        private readonly assignReposUseCase: AssignReposUseCase,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Get user permissions', description: 'Get all permissions for current user' })
    @ApiResponse({ status: 200, description: 'Permissions retrieved' })
    async getPermissions(): ReturnType<GetPermissionsUseCase['execute']> {
        const { user } = this.request;

        if (!user) {
            this.logger.warn({
                message: 'No user found in request',
                context: PermissionsController.name,
            });

            return {};
        }

        return this.getPermissionsUseCase.execute({ user });
    }

    @Get('can-access')
    @ApiOperation({ summary: 'Check access permission', description: 'Check if user has permission to access resource' })
    @ApiResponse({ status: 200, description: 'Access status' })
    @ApiQuery({ name: 'action', type: 'string', example: 'Read' })
    @ApiQuery({ name: 'resource', type: 'string', example: 'PullRequests' })
    async can(
        @Query('action') action: Action,
        @Query('resource') resource: ResourceType,
    ): Promise<boolean> {
        const { user } = this.request;

        if (!user) {
            this.logger.warn({
                message: 'No user found in request',
                context: PermissionsController.name,
            });

            return false;
        }

        return this.canAccessUseCase.execute({ user, action, resource });
    }

    @Get('assigned-repos')
    @ApiOperation({ summary: 'Get assigned repositories', description: 'Get repositories assigned to user' })
    @ApiResponse({ status: 200, description: 'Assigned repositories retrieved' })
    @ApiQuery({ name: 'userId', type: 'string', required: false })
    async getAssignedRepos(
        @Query('userId') userId?: string,
    ): Promise<string[]> {
        return this.getAssignedReposUseCase.execute({ userId });
    }

    @Post('assign-repos')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Assign repositories', description: 'Assign repositories to a user' })
    @ApiResponse({ status: 200, description: 'Repositories assigned' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Update,
            resource: ResourceType.UserSettings,
        }),
    )
    async assignRepos(
        @Body()
        body: AssignReposDto,
    ) {
        return this.assignReposUseCase.execute({
            repoIds: body.repositoryIds,
            userId: body.userId,
            teamId: body.teamId,
        });
    }
}
