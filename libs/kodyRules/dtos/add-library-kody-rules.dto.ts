import {
    KodyRuleSeverity,
    KodyRulesExampleDto,
} from '@libs/ee/kodyRules/dtos/create-kody-rule.dto';
import {
    KodyRulesOrigin,
    KodyRulesStatus,
} from '@libs/kodyRules/domain/interfaces/kodyRules.interface';
import { Type } from 'class-transformer';
import {
    IsOptional,
    IsString,
    IsNotEmpty,
    IsEnum,
    IsArray,
    ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DirectoryInfoDto {
    @ApiProperty({ description: 'Directory unique identifier', example: 'dir_xyz' })
    @IsNotEmpty()
    @IsString()
    directoryId: string;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi' })
    @IsNotEmpty()
    @IsString()
    repositoryId: string;
}

export class AddLibraryKodyRulesDto {
    @ApiProperty({ description: 'Rule unique identifier', example: 'rule_abc123', required: false })
    @IsOptional()
    @IsString()
    uuid?: string;

    @ApiProperty({ description: 'Rule title', example: 'No console.log' })
    @IsNotEmpty()
    @IsString()
    title: string;

    @ApiProperty({ description: 'Rule content/pattern', example: 'console.log' })
    @IsNotEmpty()
    @IsString()
    rule: string;

    @ApiProperty({ description: 'File path where rule applies', example: 'src/', required: false })
    @IsOptional()
    @IsString()
    path: string;

    @ApiProperty({ description: 'Rule severity level', example: 'MEDIUM' })
    @IsNotEmpty()
    @IsEnum(KodyRuleSeverity)
    severity: KodyRuleSeverity;

    @ApiProperty({ description: 'List of repository identifiers where rule applies', example: ['repo_1', 'repo_2'] })
    @IsArray()
    @IsString({ each: true })
    repositoriesIds: string[];

    @ApiProperty({ description: 'List of directories where rule applies', example: [{ directoryId: 'dir_1', repositoryId: 'repo_1' }], required: false })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DirectoryInfoDto)
    @IsOptional()
    directoriesInfo?: DirectoryInfoDto[];

    @ApiProperty({ description: 'Code examples', example: [{ snippet: 'console.log()', isCorrect: false }], required: false })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KodyRulesExampleDto)
    examples: KodyRulesExampleDto[];

    @ApiProperty({ description: 'Rule origin (e.g., CUSTOM, LIBRARY)', example: 'LIBRARY', required: false })
    @IsOptional()
    @IsEnum(KodyRulesOrigin)
    origin?: KodyRulesOrigin;

    @ApiProperty({ description: 'Rule status (e.g., ACTIVE, INACTIVE)', example: 'ACTIVE', required: false })
    @IsOptional()
    @IsEnum(KodyRulesStatus)
    status?: KodyRulesStatus;

    @ApiProperty({ description: 'Rule scope (e.g., FILE, DIRECTORY)', example: 'FILE', required: false })
    @IsOptional()
    @IsString()
    scope?: string;
}
