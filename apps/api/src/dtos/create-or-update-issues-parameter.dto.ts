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
    @ApiProperty({ description: 'Include Kody rules in issue generation', example: true })
    @IsBoolean()
    includeKodyRules: boolean;

    @ApiProperty({ description: 'Include code review engine in issue generation', example: true })
    @IsBoolean()
    includeCodeReviewEngine: boolean;
}

class SeverityFiltersDto {
    @ApiProperty({
        description: 'Minimum severity level for issues',
        example: 'MEDIUM',
    })
    @IsEnum(SeverityLevel)
    minimumSeverity: SeverityLevel;

    @ApiProperty({ description: 'List of allowed severity levels', example: ['MEDIUM', 'HIGH', 'CRITICAL'] })
    @IsArray()
    @IsEnum(SeverityLevel, { each: true })
    allowedSeverities: SeverityLevel[];
}

export class IssuesParameterDto {
    @ApiProperty({ description: 'Enable automatic issue creation', example: true })
    @IsBoolean()
    automaticCreationEnabled: boolean;

    @ApiProperty({
        description: 'Filters for issue sources',
        example: { includeKodyRules: true, includeCodeReviewEngine: true },
    })
    @ValidateNested()
    @Type(() => SourceFiltersDto)
    sourceFilters: SourceFiltersDto;

    @ApiProperty({
        description: 'Filters for issue severity',
        example: { minimumSeverity: 'MEDIUM', allowedSeverities: ['MEDIUM', 'HIGH'] },
    })
    @ValidateNested()
    @Type(() => SeverityFiltersDto)
    severityFilters: SeverityFiltersDto;
}

// required
export class OrganizationAndTeamDataDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({
        description: 'Organization unique identifier',
        example: 'org_456def',
    })
    @IsString()
    organizationId: string;
}

export class UpdateOrCreateIssuesParameterBodyDto {
    @ApiProperty({ description: 'Issue configuration parameters', example: { automaticCreationEnabled: true } })
    @ValidateNested()
    @Type(() => IssuesParameterDto)
    configValue: IssuesParameterDto;

    @ApiProperty({
        description: 'Organization and team context',
        example: { teamId: 'team_123', organizationId: 'org_456' },
    })
    @IsDefined()
    @ValidateNested()
    @Type(() => OrganizationAndTeamDataDto)
    organizationAndTeamData: OrganizationAndTeamDataDto;
}
