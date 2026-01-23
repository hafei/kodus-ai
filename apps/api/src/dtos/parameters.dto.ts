import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ParametersKey } from '@libs/core/domain/enums';

class OrganizationAndTeamDataDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;
}

export class CreateOrUpdateParameterDto {
    @ApiProperty({
        description: 'Parameter key',
        example: 'CODE_REVIEW_CONFIG',
        enum: Object.values(ParametersKey)
    })
    key: ParametersKey;

    @ApiProperty({ description: 'Configuration value (structure varies by key)', example: { enabled: true, threshold: 0.8 } })
    configValue: any;

    @ApiProperty({ description: 'Organization and team data', type: OrganizationAndTeamDataDto })
    @ValidateNested()
    @Type(() => OrganizationAndTeamDataDto)
    organizationAndTeamData: OrganizationAndTeamDataDto;
}

export class UpdateCodeReviewParameterRepositoriesDto {
    @ApiProperty({ description: 'Organization and team data', type: OrganizationAndTeamDataDto })
    @ValidateNested()
    @Type(() => OrganizationAndTeamDataDto)
    organizationAndTeamData: OrganizationAndTeamDataDto;
}
