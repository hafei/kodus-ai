import { Transform, Type } from 'class-transformer';
import { IsOptional, IsString, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EnrichedPullRequestsQueryDto {
    @ApiProperty({ description: 'Repository unique identifier filter', example: 'repo_123abc', required: false })
    @IsOptional()
    @IsString()
    repositoryId?: string;

    @ApiProperty({ description: 'Repository name filter', example: 'my-repo', required: false })
    @IsOptional()
    @IsString()
    repositoryName?: string;

    @ApiProperty({ description: 'Maximum number of results (1-100)', example: 30, required: false })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @Min(1)
    @Max(100)
    limit?: number = 30;

    @ApiProperty({ description: 'Page number', example: 1, required: false })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @Min(1)
    page?: number = 1;

    @ApiProperty({ description: 'Filter for PRs with suggestions', example: true, required: false })
    @IsOptional()
    @IsBoolean()
    @Type(() => String)
    @Transform(({ value }) => {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }

        const normalized = String(value).trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;

        return undefined;
    })
    hasSentSuggestions?: boolean;

    @ApiProperty({ description: 'PR title filter', example: 'Add feature', required: false })
    @IsOptional()
    @IsString()
    pullRequestTitle?: string;

    @ApiProperty({ description: 'Team unique identifier filter', example: 'team_456def', required: false })
    @IsOptional()
    @IsString()
    teamId?: string;
}
