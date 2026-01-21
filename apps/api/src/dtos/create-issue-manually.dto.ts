import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsString,
    IsEnum,
    IsObject,
    IsOptional,
    ValidateNested,
    IsNumber,
} from 'class-validator';

import { IRepositoryToIssues } from '@libs/issues/domain/interfaces/kodyIssuesManagement.interface';
import { LabelType } from '@libs/common/utils/codeManagement/labels';
import { SeverityLevel } from '@libs/common/utils/enums/severityLevel.enum';

class GitUserDto {
    @ApiProperty({ description: 'Git user id', example: 12345 })
    @IsNumber()
    gitId: number;
    @IsString() username: string;
}

export class CreateIssueManuallyDto {
    @ApiProperty({
        description: 'Issue title',
        example: 'Null pointer in UserService',
    })
    @IsString()
    title: string;

    @IsString()
    description: string;

    @IsString()
    filePath: string;

    @IsString()
    language: string;

    @IsEnum(LabelType)
    label: LabelType;

    @IsEnum(SeverityLevel)
    severity: SeverityLevel;

    @IsString()
    organizationId: string;

    @IsObject()
    repository: IRepositoryToIssues;

    @IsOptional()
    @ValidateNested()
    @Type(() => GitUserDto)
    owner: GitUserDto;

    @ValidateNested()
    @Type(() => GitUserDto)
    reporter: GitUserDto;
}
