import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class SummaryDto {
    @ApiPropertyOptional({ description: 'Whether to generate PR summary', example: true })
    generatePRSummary?: boolean;

    @ApiPropertyOptional({ description: 'Whether to show behavior of the PR', example: true })
    behaviorHighlights?: boolean;
}

class CommentOptionsDto {
    @ApiPropertyOptional({ description: 'Comment code suggestion setting' })
    codeSuggestion?: boolean | string;

    @ApiPropertyOptional({ description: 'Security analysis setting' })
    securityAnalysis?: boolean | string;
}

export class CreateOrUpdatePullRequestMessagesDto {
    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi' })
    @IsString()
    repositoryId: string;

    @ApiPropertyOptional({ description: 'Directory unique identifier', example: 'dir_abc123' })
    @IsOptional()
    @IsString()
    directoryId?: string;

    @ApiPropertyOptional({ description: 'Organization unique identifier', example: 'org_xyz789' })
    @IsOptional()
    @IsString()
    organizationId?: string;

    @ApiPropertyOptional({ description: 'PR summary configuration', type: SummaryDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => SummaryDto)
    summary?: SummaryDto;

    @ApiPropertyOptional({ description: 'Comment options configuration', type: CommentOptionsDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CommentOptionsDto)
    options?: CommentOptionsDto;

    @ApiPropertyOptional({ description: 'Collapsed sections configuration' })
    @IsOptional()
    collapsedSections?: Record<string, boolean>;

    @ApiPropertyOptional({ description: 'Override file patterns', type: [String] })
    @IsOptional()
    @IsArray()
    overridePatterns?: string[];
}
