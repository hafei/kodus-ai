import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CopyCodeReviewParameterDTO {
    @ApiProperty({ description: 'Source repository identifier', example: 'repo_source_123' })
    @IsString()
    sourceRepositoryId: string;

    @ApiProperty({ description: 'Target repository identifier', example: 'repo_target_456' })
    @IsString()
    targetRepositoryId: string;

    @ApiProperty({ description: 'Target directory path in repository', example: 'src/services' })
    @IsString()
    @IsOptional()
    targetDirectoryPath: string;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;
}
