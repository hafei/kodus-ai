import {
    IKodyRuleExternalReference,
    IKodyRuleReferenceSyncError,
    IKodyRulesExample,
    KodyRuleProcessingStatus,
    KodyRulesOrigin,
    KodyRulesScope,
    KodyRulesStatus,
} from '@libs/kodyRules/domain/interfaces/kodyRules.interface';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum KodyRuleSeverity {
    LOW = 'low',
    MEDIUM = 'medium',
    HIGH = 'high',
    CRITICAL = 'critical',
}

export class KodyRulesExampleDto implements IKodyRulesExample {
    @ApiProperty({ description: 'Code snippet example', example: 'console.log("debug")' })
    @IsString()
    snippet: string;

    @ApiProperty({ description: 'Whether the snippet is a correct or incorrect example', example: false })
    @IsBoolean()
    isCorrect: boolean;
}

export class KodyRulesInheritanceDto {
    @ApiProperty({ description: 'Whether rule is inheritable by child directories', example: true })
    @IsBoolean()
    inheritable: boolean;

    @ApiProperty({ description: 'List of directories to include in inheritance', example: ['src', 'lib'], required: false })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    include: string[];
}

export class KodyRuleExternalReferenceDto implements IKodyRuleExternalReference {
    @ApiProperty({ description: 'File path where rule is referenced', example: 'src/rules/no-console.ts' })
    @IsString()
    filePath: string;

    @ApiProperty({ description: 'Description of the reference', example: 'Custom no-console rule', required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ description: 'Repository name', example: 'my-repo', required: false })
    @IsOptional()
    @IsString()
    repositoryName?: string;
}

export class CreateKodyRuleDto {
    @ApiProperty({ description: 'Rule unique identifier', example: 'rule_abc123', required: false })
    @IsOptional()
    @IsString()
    uuid?: string;

    @ApiProperty({ description: 'Rule title', example: 'No console.log' })
    @IsNotEmpty()
    @IsString()
    title: string;

    @ApiProperty({ description: 'Rule scope (e.g., FILE, DIRECTORY)', example: 'FILE', required: false })
    @IsOptional()
    @IsString()
    scope?: KodyRulesScope;

    @ApiProperty({ description: 'Rule content/pattern', example: 'console.log' })
    @IsNotEmpty()
    @IsString()
    rule: string;

    @ApiProperty({ description: 'File path where rule applies', example: 'src/', required: false })
    @IsOptional()
    @IsString()
    path: string;

    @ApiProperty({ description: 'Source file path', example: 'src/rules/', required: false })
    @IsOptional()
    @IsString()
    sourcePath?: string;

    @ApiProperty({ description: 'Source anchor position', example: 'L10-20', required: false })
    @IsOptional()
    @IsString()
    sourceAnchor?: string;

    @ApiProperty({ description: 'Rule severity level', example: 'MEDIUM' })
    @IsNotEmpty()
    @IsEnum(KodyRuleSeverity)
    severity: KodyRuleSeverity;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi', required: false })
    @IsOptional()
    @IsString()
    repositoryId?: string;

    @ApiProperty({ description: 'Directory unique identifier', example: 'dir_xyz', required: false })
    @IsOptional()
    @IsString()
    directoryId?: string;

    @ApiProperty({ description: 'Rule origin (e.g., CUSTOM, LIBRARY)', example: 'CUSTOM' })
    @IsEnum(KodyRulesOrigin)
    origin: KodyRulesOrigin;

    @ApiProperty({ description: 'Rule status (e.g., ACTIVE, INACTIVE)', example: 'ACTIVE', required: false })
    @IsEnum(KodyRulesStatus)
    @IsOptional()
    status?: KodyRulesStatus;

    @ApiProperty({ description: 'Code examples for the rule', example: [{ snippet: 'console.log()', isCorrect: false }], required: false })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KodyRulesExampleDto)
    examples: KodyRulesExampleDto[];

    @ApiProperty({ description: 'Inheritance settings for the rule', example: { inheritable: true, include: ['src'] }, required: false })
    @IsOptional()
    @ValidateNested()
    @Type(() => KodyRulesInheritanceDto)
    inheritance?: KodyRulesInheritanceDto;

    @ApiProperty({ description: 'External references to this rule', example: [{ filePath: 'src/rules.ts' }], required: false })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => KodyRuleExternalReferenceDto)
    externalReferences?: KodyRuleExternalReferenceDto[];

    @ApiProperty({ description: 'Synchronization errors', example: [], required: false })
    @IsOptional()
    syncErrors?: IKodyRuleReferenceSyncError[];

    @ApiProperty({ description: 'Reference processing status', example: 'PROCESSED', required: false })
    @IsOptional()
    @IsEnum(KodyRuleProcessingStatus)
    referenceProcessingStatus?: KodyRuleProcessingStatus;

    @ApiProperty({ description: 'Timestamp when reference was last processed', example: '2024-01-01T00:00:00Z', required: false })
    @IsOptional()
    lastReferenceProcessedAt?: Date;

    @ApiProperty({ description: 'Rule hash for deduplication', example: 'abc123def', required: false })
    @IsOptional()
    @IsString()
    ruleHash?: string;
}
