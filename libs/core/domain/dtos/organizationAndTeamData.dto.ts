import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OrganizationAndTeamDataDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc', required: false })
    @IsOptional()
    @IsString()
    teamId?: string;

    @ApiProperty({ description: 'Organization unique identifier', example: 'org_456def', required: false })
    @IsOptional()
    @IsString()
    organizationId?: string;
}
