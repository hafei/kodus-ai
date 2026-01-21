import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TeamQueryDto {
    @ApiProperty({ description: 'Team ID', example: 'team_123' })
    @IsString()
    readonly teamId: string;
}
