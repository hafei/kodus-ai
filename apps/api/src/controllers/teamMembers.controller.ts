import {
    Body,
    Controller,
    DefaultValuePipe,
    Delete,
    Get,
    Param,
    ParseBoolPipe,
    Post,
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
import { TeamQueryDto } from '@libs/organization/dtos/teamId-query.dto';
import {
    CheckPolicies,
    PolicyGuard,
} from '@libs/identity/infrastructure/adapters/services/permissions/policy.guard';
import {
    Action,
    ResourceType,
} from '@libs/identity/domain/permissions/enums/permissions.enum';
import { checkPermissions } from '@libs/identity/infrastructure/adapters/services/permissions/policy.handlers';
import { IMembers } from '@libs/organization/domain/teamMembers/interfaces/teamMembers.interface';
import { CreateOrUpdateTeamMembersUseCase } from '@libs/organization/application/use-cases/teamMembers/create.use-case';
import { GetTeamMembersUseCase } from '@libs/organization/application/use-cases/teamMembers/get-team-members.use-case';
import { DeleteTeamMembersUseCase } from '@libs/organization/application/use-cases/teamMembers/delete.use-case';

@ApiTags('Team Members')
@ApiSecurity('Bearer', [])
@Controller('team-members')
export class TeamMembersController {
    constructor(
        private readonly createOrUpdateTeamMembersUseCase: CreateOrUpdateTeamMembersUseCase,
        private readonly getTeamMembersUseCase: GetTeamMembersUseCase,
        private readonly deleteTeamMembersUseCase: DeleteTeamMembersUseCase,
    ) {}

    @Get('/')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Get team members', description: 'Get all members of a team' })
    @ApiResponse({ status: 200, description: 'Team members retrieved' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Read,
            resource: ResourceType.UserSettings,
        }),
    )
    public async getTeamMembers(@Query() query: TeamQueryDto) {
        return this.getTeamMembersUseCase.execute(query.teamId);
    }

    @Post('/')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Create or update team members', description: 'Add or update team members' })
    @ApiResponse({ status: 200, description: 'Team members updated' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Create,
            resource: ResourceType.UserSettings,
        }),
    )
    public async createOrUpdateTeamMembers(
        @Body() body: { members: IMembers[]; teamId: string },
    ) {
        return this.createOrUpdateTeamMembersUseCase.execute(
            body.teamId,
            body.members,
        );
    }

    @Delete('/:uuid')
    @UseGuards(PolicyGuard)
    @ApiOperation({ summary: 'Delete team member', description: 'Remove member from team' })
    @ApiResponse({ status: 200, description: 'Team member deleted' })
    @ApiParam({ name: 'uuid', type: 'string', example: 'member_123abc' })
    @CheckPolicies(
        checkPermissions({
            action: Action.Delete,
            resource: ResourceType.UserSettings,
        }),
    )
    public async deleteTeamMember(
        @Param('uuid') uuid: string,
        @Query('removeAll', new DefaultValuePipe(false), ParseBoolPipe)
        removeAll: boolean,
    ) {
        return this.deleteTeamMembersUseCase.execute(uuid, removeAll);
    }
}
