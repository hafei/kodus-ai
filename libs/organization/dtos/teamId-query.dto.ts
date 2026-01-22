import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TeamQueryDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsUUID()
    teamId: string;
}
