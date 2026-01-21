import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExecuteDryRunDto {
    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @ApiProperty({ description: 'Team identifier', example: 'team_123' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'repositoryId', example: 'repositoryId_example' })
    @IsString()
    repositoryId: string;

    @ApiProperty({ description: 'prNumber', example: 123 })
    @IsNumber()
    prNumber: number;
}
