import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class RefDto {
    @ApiProperty({ description: 'Branch reference name', example: 'main' })
    @IsString()
    ref: string;
}

export class AnalyzeDependenciesDto {
    @ApiProperty({ description: 'Repository ID', example: '123456789' })
    @IsString()
    id: string;

    @ApiProperty({ description: 'Repository name', example: 'my-repo' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Full repository name', example: 'org/my-repo' })
    @IsString()
    full_name: string;

    @ApiProperty({ description: 'Pull request number', example: '42' })
    @IsString()
    number: string;

    @ApiProperty({ description: 'Head branch reference', type: RefDto })
    @ValidateNested()
    @Type(() => RefDto)
    head: RefDto;

    @ApiProperty({ description: 'Base branch reference', type: RefDto })
    @ValidateNested()
    @Type(() => RefDto)
    base: RefDto;

    @ApiProperty({ description: 'Platform type', example: 'github' })
    @IsString()
    platform: string;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiPropertyOptional({ description: 'Specific file paths to analyze', type: [String], example: ['src/index.ts', 'src/utils.ts'] })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    filePaths?: string[];
}

export class GetRelatedContentFromDiffDto {
    @ApiProperty({ description: 'Repository ID', example: '123456789' })
    @IsString()
    id: string;

    @ApiProperty({ description: 'Repository name', example: 'my-repo' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Full repository name', example: 'org/my-repo' })
    @IsString()
    full_name: string;

    @ApiProperty({ description: 'Pull request number', example: '42' })
    @IsString()
    number: string;

    @ApiProperty({ description: 'Head branch reference', type: RefDto })
    @ValidateNested()
    @Type(() => RefDto)
    head: RefDto;

    @ApiProperty({ description: 'Base branch reference', type: RefDto })
    @ValidateNested()
    @Type(() => RefDto)
    base: RefDto;

    @ApiProperty({ description: 'Platform type', example: 'github' })
    @IsString()
    platform: string;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Git diff content', example: '@@ -1,5 +1,6 @@...' })
    @IsString()
    diff: string;

    @ApiProperty({ description: 'Path to the file being analyzed', example: 'src/utils/helper.ts' })
    @IsString()
    filePath: string;

    @ApiProperty({ description: 'AST analysis task ID', example: 'task_abc123' })
    @IsString()
    taskId: string;
}
