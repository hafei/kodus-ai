import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AuthIntegrationDto {
    @ApiProperty({ description: 'Platform type (e.g., github, gitlab, bitbucket)', example: 'github' })
    @IsString()
    platform: string;

    @ApiProperty({ description: 'Authentication token for the platform', example: 'ghp_xxxxxxxxxxxx' })
    @IsString()
    token: string;

    @ApiPropertyOptional({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsOptional()
    @IsString()
    teamId?: string;

    @ApiPropertyOptional({ description: 'Organization name on the platform', example: 'my-organization' })
    @IsOptional()
    @IsString()
    organizationName?: string;
}

class RepositoryDto {
    @ApiProperty({ description: 'Repository ID', example: '123456' })
    id: string | number;

    @ApiProperty({ description: 'Repository name', example: 'my-repo' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ description: 'Full repository name', example: 'org/my-repo' })
    @IsOptional()
    @IsString()
    fullName?: string;

    @ApiPropertyOptional({ description: 'Whether repository is selected', example: true })
    @IsOptional()
    selected?: boolean;
}

export class CreateRepositoriesDto {
    @ApiProperty({ description: 'List of repositories to add', type: [RepositoryDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RepositoryDto)
    repositories: RepositoryDto[];

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiPropertyOptional({ description: 'Operation type: replace all or append', enum: ['replace', 'append'], example: 'append' })
    @IsOptional()
    @IsString()
    type?: 'replace' | 'append';
}
