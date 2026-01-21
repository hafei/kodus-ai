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

    @IsOptional()
    @IsString()
    severity?: string;

    @IsOptional()
    @Transform(transformToArray)
    @IsArray()
    @IsString({ each: true })
    tags?: string[];

    @IsOptional()
    @IsBoolean()
    @Transform(FindLibraryKodyRulesDto.transformToBoolean)
    plug_and_play?: boolean;

    @IsOptional()
    @IsBoolean()
    @Transform(FindLibraryKodyRulesDto.transformToBoolean)
    needMCPS?: boolean;

    @IsOptional()
    language?: ProgrammingLanguage;

    @IsOptional()
    @Transform(transformToArray)
    @IsArray()
    @IsString({ each: true })
    buckets?: string[];
}
