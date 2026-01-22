import { Transform } from 'class-transformer';
import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { ProgrammingLanguage } from '@libs/core/domain/enums/programming-language.enum';
import { KodyRuleFilters } from '@libs/core/infrastructure/config/types/general/kodyRules.type';

import { PaginationDto } from './pagination.dto';

const transformToArray = ({ value }: { value: unknown }): string[] => {
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return Array.isArray(value) ? value : [];
};

export class FindLibraryKodyRulesDto
    extends PaginationDto
    implements KodyRuleFilters
{
    static transformToBoolean({
        value,
    }: {
        value: unknown;
    }): boolean | undefined {
        if (value === undefined || value === null || value === '') {
            return undefined;
        }
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (['true', '1', 'yes', 'y'].includes(normalized)) {
                return true;
            }
            if (['false', '0', 'no', 'n'].includes(normalized)) {
                return false;
            }
        }
        return Boolean(value);
    }

    @ApiProperty({ description: 'Filter by rule title', example: 'no-console', required: false })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty({ description: 'Severity level filter (e.g., high, medium, low)', example: 'high', required: false })
    @IsOptional()
    @IsString()
    severity?: string;

    @ApiProperty({ description: 'Comma-separated tags to filter', example: 'security,performance', required: false })
    @IsOptional()
    @Transform(transformToArray)
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @ApiProperty({ description: 'Filter for plug-and-play rules (no configuration needed)', example: true, required: false })
    @IsOptional()
    @IsBoolean()
    @Transform(FindLibraryKodyRulesDto.transformToBoolean)
    plug_and_play?: boolean;

    @ApiProperty({ description: 'Filter for rules requiring MCP servers', example: true, required: false })
    @IsOptional()
    @IsBoolean()
    @Transform(FindLibraryKodyRulesDto.transformToBoolean)
    needMCPS?: boolean;

    @ApiProperty({ description: 'Programming language filter (e.g., TYPESCRIPT, PYTHON)', example: 'TYPESCRIPT', required: false })
    @IsOptional()
    language?: ProgrammingLanguage;

    @ApiProperty({ description: 'Comma-separated bucket categories', example: 'backend,frontend', required: false })
    @IsOptional()
    @Transform(transformToArray)
    @IsArray()
    @IsString({ each: true })
    buckets?: string[];
}
