import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExecuteDryRunDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({
        description: 'Repository unique identifier',
        example: 'repo_789ghi',
    })
    @IsString()
    repositoryId: string;

    @ApiProperty({ description: 'Pull request number', example: 123 })
    @IsNumber()
    prNumber: number;
}
