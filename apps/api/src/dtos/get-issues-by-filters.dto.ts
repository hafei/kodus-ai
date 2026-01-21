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
        description: 'severity',
        example: 'severity_example',
        required: false,
    })
    @IsOptional()
    severity?: SeverityLevel;

    @ApiProperty({
        description: 'category',
        example: 'category_example',
        required: false,
    })
    @IsOptional()
    category?: LabelType;

    @ApiProperty({
        description: 'status',
        example: 'status_example',
        required: false,
    })
    @IsOptional()
    status?: IssueStatus;

    @ApiProperty({
        description: 'organizationId',
        example: 'organizationId_example',
        required: false,
    })
    @IsOptional()
    @IsString()
    organizationId?: string;

    @ApiProperty({
        description: 'repositoryName',
        example: 'repositoryName_example',
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
        description: 'filePath',
        example: 'filePath_example',
        required: false,
    })
    @IsOptional()
    @IsString()
    filePath?: string;

    @ApiProperty({
        description: 'prAuthor',
        example: 'prAuthor_example',
        required: false,
    })
    @IsOptional()
    @IsString()
    prAuthor?: string;

    @ApiProperty({
        description: 'beforeAt',
        example: 'beforeAt_example',
        required: false,
    })
    @IsOptional()
    @IsString()
    beforeAt?: string;

    @ApiProperty({
        description: 'afterAt',
        example: 'afterAt_example',
        required: false,
    })
    @IsOptional()
    @IsString()
    afterAt?: string;
}
