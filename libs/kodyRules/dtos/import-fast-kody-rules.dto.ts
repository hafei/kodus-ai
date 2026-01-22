import {
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { KodyRulesScope } from '@libs/kodyRules/domain/interfaces/kodyRules.interface';
import { KodyRuleSeverity } from '@libs/ee/kodyRules/dtos/create-kody-rule.dto';

class ImportFastKodyRuleItemDto {
    @ApiProperty({ description: 'Rule title', example: 'No console.log' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ description: 'Rule content/pattern', example: 'console.log' })
    @IsString()
    @IsNotEmpty()
    rule: string;

    @ApiProperty({ description: 'File path where rule applies', example: 'src/' })
    @IsString()
    @IsNotEmpty()
    path: string;

    @ApiProperty({ description: 'Source file path', example: 'src/rules/' })
    @IsString()
    @IsNotEmpty()
    sourcePath: string;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi' })
    @IsString()
    @IsNotEmpty()
    repositoryId: string;

    @ApiProperty({ description: 'Rule severity level', example: 'MEDIUM', required: false })
    @IsOptional()
    @IsEnum(KodyRuleSeverity)
    severity?: KodyRuleSeverity;

    @ApiProperty({ description: 'Rule scope (e.g., FILE, DIRECTORY)', example: 'FILE', required: false })
    @IsOptional()
    @IsEnum(KodyRulesScope)
    scope?: KodyRulesScope;

    @ApiProperty({ description: 'Code examples', example: [{ snippet: 'console.log()', isCorrect: false }], required: false })
    @IsOptional()
    examples?: Array<{ snippet: string; isCorrect: boolean }>;
}

export class ImportFastKodyRulesDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    @IsNotEmpty()
    teamId: string;

    @ApiProperty({ description: 'List of rules to import', example: [{ title: 'No console.log', rule: 'console.log' }] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ImportFastKodyRuleItemDto)
    rules: ImportFastKodyRuleItemDto[];
}
