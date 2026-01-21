import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExecuteDryRunDto {
    @ApiProperty({ description: 'Team identifier', example: 'team_123' })
    @IsString()
    teamId: string;

    @IsString()
    repositoryId: string;

    @IsNumber()
    prNumber: number;
}
