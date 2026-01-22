import { IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { IssueStatus } from '@libs/core/infrastructure/config/types/general/issues.type';
import { LabelType } from '@libs/common/utils/codeManagement/labels';
import { SeverityLevel } from '@libs/common/utils/enums/severityLevel.enum';

export class GetIssuesByFiltersDto {
    @ApiProperty({
        description: 'Issue title filter',
        example: 'Null pointer in UserService',
        required: false,
    })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty({
        description: 'Issue severity level filter',
        example: 'HIGH',
        required: false,
    })
    @IsOptional()
    severity?: SeverityLevel;

    @ApiProperty({
        description: 'Issue category/label filter',
        example: 'BUG',
        required: false,
    })
    @IsOptional()
    category?: LabelType;

    @ApiProperty({
        description: 'Issue status filter',
        example: 'OPEN',
        required: false,
    })
    @IsOptional()
    status?: IssueStatus;

    @ApiProperty({
        description: 'Organization unique identifier filter',
        example: 'org_123abc',
        required: false,
    })
    @IsOptional()
    @IsString()
    organizationId?: string;

    @ApiProperty({
        description: 'Repository name filter',
        example: 'my-repo',
        required: false,
    })
    @IsOptional()
    @IsString()
    repositoryName?: string;

    @ApiProperty({ description: 'prNumber', example: 123, required: false })
    @IsOptional()
    @IsNumber()
    prNumber?: number;

    @ApiProperty({
        description: 'File path filter',
        example: 'src/services',
        required: false,
    })
    @IsOptional()
    @IsString()
    filePath?: string;

    @ApiProperty({
        description: 'PR author username filter',
        example: 'alice',
        required: false,
    })
    @IsOptional()
    @IsString()
    prAuthor?: string;

    @ApiProperty({
        description: 'Filter issues created before this date (ISO 8601)',
        example: '2024-01-01T00:00:00Z',
        required: false,
    })
    @IsOptional()
    @IsString()
    beforeAt?: string;

    @ApiProperty({
        description: 'Filter issues created after this date (ISO 8601)',
        example: '2024-01-01T00:00:00Z',
        required: false,
    })
    @IsOptional()
    @IsString()
    afterAt?: string;
}
