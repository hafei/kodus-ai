import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ProgrammingLanguage } from '@libs/core/domain/enums/programming-language.enum';
import { PaginationDto } from '@libs/core/domain/dtos/pagination.dto';
import { KodyRuleFilters } from '@libs/core/infrastructure/config/types/general/kodyRules.type';

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
    private static transformToBoolean = ({ value }: { value: unknown }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    };

    @ApiProperty({
        description: 'Filter by rule title',
        example: 'no-console',
        required: false,
    })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty({
        description: 'Severity level filter (e.g., high, medium, low)',
        example: 'high',
        required: false,
    })
    @IsOptional()
    @IsString()
    severity?: string;

    @ApiProperty({
        description: 'Comma-separated tags to filter',
        example: 'security,performance',
        required: false,
    })
    @IsOptional()
    @Transform(transformToArray)
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @ApiProperty({
        description: 'Filter for plug-and-play rules (no configuration needed)',
        example: true,
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    @Transform(FindLibraryKodyRulesDto.transformToBoolean)
    plug_and_play?: boolean;

    @ApiProperty({ description: 'Filter for rules requiring MCP servers', example: true, required: false })
    @IsOptional()
    @IsBoolean()
    @Transform(FindLibraryKodyRulesDto.transformToBoolean)
    needMCPS?: boolean;

    @ApiProperty({
        description: 'Programming language filter (e.g., TYPESCRIPT, PYTHON)',
        example: 'TYPESCRIPT',
        required: false,
    })
    @IsOptional()
    language?: ProgrammingLanguage;

    @ApiProperty({
        description: 'Comma-separated bucket categories',
        example: 'backend,frontend',
        required: false,
    })
    @IsOptional()
    @Transform(transformToArray)
    @IsArray()
    @IsString({ each: true })
    buckets?: string[];
}
