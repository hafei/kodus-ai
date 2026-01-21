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
    @ApiProperty({ description: 'gitId', example: 123 })
    @ApiProperty({ description: 'Git user id', example: 12345 })
    @IsNumber()
    gitId: number;
    @IsString() username: string;
}

export class CreateIssueManuallyDto {
    @ApiProperty({
        description: 'Issue title',
        @ApiProperty({ description: 'example', example: 123 })
        example: 'Null pointer in UserService',
    })
    @ApiProperty({ description: 'title', example: 'title_example' })
    @IsString()
    title: string;

    @ApiProperty({ description: 'description', example: 'description_example' })
    @IsString()
    description: string;

    @ApiProperty({ description: 'filePath', example: 'filePath_example' })
    @IsString()
    filePath: string;

    @ApiProperty({ description: 'language', example: 'language_example' })
    @IsString()
    language: string;

    @ApiProperty({ description: 'label', example: 'label_example' })
    @IsEnum(LabelType)
    label: LabelType;

    @ApiProperty({ description: 'severity', example: 'severity_example' })
    @IsEnum(SeverityLevel)
    severity: SeverityLevel;

    @ApiProperty({ description: 'organizationId', example: 'organizationId_example' })
    @IsString()
    organizationId: string;

    @ApiProperty({ description: 'repository', example: 'repository_example' })
    @IsObject()
    repository: IRepositoryToIssues;

    @ApiProperty({ description: 'owner', example: 'owner_example' })
    @IsOptional()
    @ValidateNested()
    @Type(() => GitUserDto)
    owner: GitUserDto;

    @ApiProperty({ description: 'reporter', example: 'reporter_example' })
    @ValidateNested()
    @Type(() => GitUserDto)
    reporter: GitUserDto;
}
