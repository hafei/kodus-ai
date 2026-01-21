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

    @IsOptional()
    severity?: SeverityLevel;

    @IsOptional()
    category?: LabelType;

    @IsOptional()
    status?: IssueStatus;

    @IsOptional()
    @IsString()
    organizationId?: string;

    @IsOptional()
    @IsString()
    repositoryName?: string;

    @IsOptional()
    @IsNumber()
    prNumber?: number;

    @IsOptional()
    @IsString()
    filePath?: string;

    @IsOptional()
    @IsString()
    prAuthor?: string;

    @IsOptional()
    @IsString()
    beforeAt?: string;

    @IsOptional()
    @IsString()
    afterAt?: string;
}
