import {
    Body,
    Controller,
    Get,
    Inject,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBody,
    ApiQuery,
    ApiParam,
    ApiSecurity,
} from '@nestjs/swagger';

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

import { AcceptUserInvitationDto } from '@libs/identity/dtos/accept-user-invitation.dto';
import { JoinOrganizationDto } from '@libs/identity/dtos/join-organization.dto';
import { UpdateAnotherUserDto } from '@libs/identity/dtos/update-another-user.dto';
import { UserRequest } from '@libs/core/infrastructure/config/types/http/user-request.type';
import { InviteDataUserUseCase } from '@libs/identity/application/use-cases/user/invite-data.use-case';
import { AcceptUserInvitationUseCase } from '@libs/identity/application/use-cases/user/accept-user-invitation.use-case';
import { CheckUserWithEmailUserUseCase } from '@libs/identity/application/use-cases/user/check-user-email.use-case';
import { JoinOrganizationUseCase } from '@libs/organization/application/use-cases/onboarding/join-organization.use-case';
import { UpdateAnotherUserUseCase } from '@libs/identity/application/use-cases/user/update-another.use-case';

@ApiTags('Users')
@ApiSecurity('Bearer', [])
@Controller('user')
export class UsersController {
    constructor(
        private readonly inviteDataUserUseCase: InviteDataUserUseCase,
        private readonly acceptUserInvitationUseCase: AcceptUserInvitationUseCase,
        private readonly checkUserWithEmailUserUseCase: CheckUserWithEmailUserUseCase,
        private readonly joinOrganizationUseCase: JoinOrganizationUseCase,
        private readonly updateAnotherUserUseCase: UpdateAnotherUserUseCase,

        @Inject(REQUEST)
        private readonly request: UserRequest,
    ) {}

    @Get('/email')
    @ApiOperation({ summary: 'Check if user exists by email', description: 'Query user by email address' })
    @ApiResponse({ status: 200, description: 'User found' })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiQuery({ name: 'email', type: 'string', example: 'user@example.com' })
    public async getEmail(
        @Query('email')
        email: string,
    ) {
        return await this.checkUserWithEmailUserUseCase.execute(email);
    }

    @Get('/invite')
    @ApiOperation({ summary: 'Get user invitation data', description: 'Retrieve invitation details for a user' })
    @ApiResponse({ status: 200, description: 'Invitation data retrieved' })
    @ApiResponse({ status: 404, description: 'Invitation not found' })
    @ApiQuery({ name: 'userId', type: 'string', example: 'user_123abc' })
    public async getInviteDate(
        @Query('userId')
        userId: string,
    ) {
        return await this.inviteDataUserUseCase.execute(userId);
    }

    @Post('/invite/complete-invitation')
    @ApiOperation({ summary: 'Complete user invitation', description: 'Accept invitation and complete user registration' })
    @ApiResponse({ status: 200, description: 'Invitation completed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid invitation data' })
    public async completeInvitation(@Body() body: AcceptUserInvitationDto) {
        return await this.acceptUserInvitationUseCase.execute(body);
    }

    @Post('/join-organization')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Join organization', description: 'User joins an existing organization' })
    @ApiSecurity('Bearer', [])
    @ApiResponse({ status: 200, description: 'Joined organization successfully' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.UserSettings,
        }),
    )
    public async joinOrganization(@Body() body: JoinOrganizationDto) {
        return await this.joinOrganizationUseCase.execute(body);
    }

    @Patch('/:targetUserId')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Update another user', description: 'Update user information by admin' })
    @ApiSecurity('Bearer', [])
    @ApiResponse({ status: 200, description: 'User updated successfully' })
    @ApiResponse({ status: 403, description: 'Permission denied' })
    @ApiResponse({ status: 404, description: 'User not found' })
    @ApiParam({ name: 'targetUserId', type: 'string', example: 'user_456def' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Update,
            resource: ResourceType.UserSettings,
        }),
    )
    public async updateAnother(
        @Body() body: UpdateAnotherUserDto,
        @Param('targetUserId') targetUserId: string,
    ): Promise<IUser> {
        if (!targetUserId) {
            throw new Error('targetUserId is required');
        }

        const userId = this.request.user?.uuid;
        const organizationId = this.request.user?.organization?.uuid;

        if (!userId) {
            throw new Error('User not found in request');
        }

        if (!organizationId) {
            throw new Error('Organization not found in request');
        }

        return await this.updateAnotherUserUseCase.execute(
            userId,
            targetUserId,
            body,
            organizationId,
        );
    }
}
