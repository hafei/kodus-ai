import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTeamDto {
    @ApiProperty({ description: 'Team name', example: 'Platform Ops' })
    @IsString()
    teamName: string;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;
}
