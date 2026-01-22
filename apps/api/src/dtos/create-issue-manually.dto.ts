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
    @ApiProperty({ description: 'Git platform user ID', example: 12345 })
    @IsNumber()
    gitId: number;
    @ApiProperty({ description: 'Git username', example: 'alice' })
    @IsString()
    username: string;
}

export class CreateIssueManuallyDto {
    @ApiProperty({
        description: 'Issue title',
        example: 'Null pointer in UserService',
    })
    @IsString()
    title: string;

    @ApiProperty({ description: 'Detailed issue description', example: 'Null pointer exception when accessing user service' })
    @IsString()
    description: string;

    @ApiProperty({ description: 'File path where issue occurs', example: 'src/services/user.service.ts' })
    @IsString()
    filePath: string;

    @ApiProperty({ description: 'Programming language', example: 'TYPESCRIPT' })
    @IsString()
    language: string;

    @ApiProperty({ description: 'Issue label category', example: 'BUG' })
    @IsEnum(LabelType)
    label: LabelType;

    @ApiProperty({ description: 'Issue severity level', example: 'HIGH' })
    @IsEnum(SeverityLevel)
    severity: SeverityLevel;

    @ApiProperty({
        description: 'Organization unique identifier',
        example: 'org_456def',
    })
    @IsString()
    organizationId: string;

    @ApiProperty({ description: 'Repository information', example: { id: 'repo_123', name: 'my-repo' } })
    @IsObject()
    repository: IRepositoryToIssues;

    @ApiProperty({ description: 'Issue owner (author) information', example: { gitId: 12345, username: 'alice' } })
    @IsOptional()
    @ValidateNested()
    @Type(() => GitUserDto)
    owner: GitUserDto;

    @ApiProperty({ description: 'Issue reporter information', example: { gitId: 67890, username: 'bob' } })
    @ValidateNested()
    @Type(() => GitUserDto)
    reporter: GitUserDto;
}
