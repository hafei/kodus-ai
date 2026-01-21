import { SeverityLevel } from '@libs/common/utils/enums/severityLevel.enum';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsBoolean,
    IsEnum,
    IsString,
    IsArray,
    ValidateNested,
    IsDefined,
} from 'class-validator';

class SourceFiltersDto {
    @ApiProperty({ description: 'includeKodyRules', example: true })
    @IsBoolean()
    includeKodyRules: boolean;

    @ApiProperty({ description: 'includeCodeReviewEngine', example: true })
    @IsBoolean()
    includeCodeReviewEngine: boolean;
}

class SeverityFiltersDto {
    @ApiProperty({
        description: 'minimumSeverity',
        example: 'minimumSeverity_example',
    })
    @IsEnum(SeverityLevel)
    minimumSeverity: SeverityLevel;

    @ApiProperty({ description: 'allowedSeverities', example: ['example'] })
    @IsArray()
    @IsEnum(SeverityLevel, { each: true })
    allowedSeverities: SeverityLevel[];
}

export class IssuesParameterDto {
    @ApiProperty({ description: 'automaticCreationEnabled', example: true })
    @IsBoolean()
    automaticCreationEnabled: boolean;

    @ApiProperty({
        description: 'sourceFilters',
        example: 'sourceFilters_example',
    })
    @ValidateNested()
    @Type(() => SourceFiltersDto)
    sourceFilters: SourceFiltersDto;

    @ApiProperty({
        description: 'severityFilters',
        example: 'severityFilters_example',
    })
    @ValidateNested()
    @Type(() => SeverityFiltersDto)
    severityFilters: SeverityFiltersDto;
}

// required
export class OrganizationAndTeamDataDto {
    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsString()
    teamId: string;

    @ApiProperty({
        description: 'organizationId',
        example: 'organizationId_example',
    })
    @IsString()
    organizationId: string;
}

export class UpdateOrCreateIssuesParameterBodyDto {
    @ApiProperty({ description: 'configValue', example: 'configValue_example' })
    @ValidateNested()
    @Type(() => IssuesParameterDto)
    configValue: IssuesParameterDto;

    @ApiProperty({
        description: 'organizationAndTeamData',
        example: 'organizationAndTeamData_example',
    })
    @IsDefined()
    @ValidateNested()
    @Type(() => OrganizationAndTeamDataDto)
    organizationAndTeamData: OrganizationAndTeamDataDto;
}
