import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';

import { ListTeamsWithIntegrationsUseCase } from '@libs/organization/application/use-cases/team/list-with-integrations.use-case';
import { ListTeamsUseCase } from '@libs/organization/application/use-cases/team/list.use-case';

@ApiTags('Teams')
@ApiSecurity('Bearer', [])
@Controller('team')
export class TeamController {
    constructor(
        private readonly listTeamsUseCase: ListTeamsUseCase,
        private readonly listTeamsWithIntegrationsUseCase: ListTeamsWithIntegrationsUseCase,
    ) {}

    @Get('/')
    @ApiOperation({ summary: 'List teams', description: 'Get all teams for current user' })
    @ApiResponse({ status: 200, description: 'Teams retrieved successfully' })
    @ApiSecurity('Bearer', [])
    public async list() {
        return await this.listTeamsUseCase.execute();
    }

    @Get('/list-with-integrations')
    @ApiOperation({ summary: 'List teams with integrations', description: 'Get all teams with their integration status' })
    @ApiResponse({ status: 200, description: 'Teams with integrations retrieved' })
    @ApiSecurity('Bearer', [])
    public async listWithIntegrations() {
        return await this.listTeamsWithIntegrationsUseCase.execute();
    }
}
