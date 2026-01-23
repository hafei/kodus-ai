import { IsString, IsOptional, IsBoolean, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { OrganizationParametersKey } from '@libs/core/domain/enums';

export class CreateOrUpdateOrgParameterDto {
    @ApiProperty({
        description: 'Organization parameter key',
        example: 'BYOK_CONFIG',
        enum: Object.values(OrganizationParametersKey)
    })
    key: OrganizationParametersKey;

    @ApiProperty({ description: 'Configuration value (structure varies by key)', example: { provider: 'openai', model: 'gpt-4' } })
    configValue: any;
}

class CockpitMetricsVisibilityConfigDto {
    @ApiPropertyOptional({ description: 'Show commits metric', example: true })
    @IsOptional()
    @IsBoolean()
    commits?: boolean;

    @ApiPropertyOptional({ description: 'Show pull requests metric', example: true })
    @IsOptional()
    @IsBoolean()
    pullRequests?: boolean;

    @ApiPropertyOptional({ description: 'Show code reviews metric', example: true })
    @IsOptional()
    @IsBoolean()
    codeReviews?: boolean;

    @ApiPropertyOptional({ description: 'Show issues metric', example: true })
    @IsOptional()
    @IsBoolean()
    issues?: boolean;
}

export class UpdateCockpitMetricsVisibilityDto {
    @ApiPropertyOptional({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsOptional()
    @IsString()
    teamId?: string;

    @ApiProperty({ description: 'Metrics visibility configuration', type: CockpitMetricsVisibilityConfigDto })
    @ValidateNested()
    @Type(() => CockpitMetricsVisibilityConfigDto)
    config: CockpitMetricsVisibilityConfigDto;
}

export class IgnoreBotsDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;
}

export class UpdateAutoLicenseAllowedUsersDto {
    @ApiPropertyOptional({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsOptional()
    @IsString()
    teamId?: string;

    @ApiPropertyOptional({ description: 'Include current user in allowed users', example: true })
    @IsOptional()
    @IsBoolean()
    includeCurrentUser?: boolean;

    @ApiPropertyOptional({ description: 'Organization unique identifier', example: 'org_xyz789' })
    @IsOptional()
    @IsString()
    organizationId?: string;
}
