import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { ReviewPreset } from '@libs/core/infrastructure/config/types/general/codeReview.type';
import { OrganizationAndTeamDataDto } from '@libs/core/domain/dtos/organizationAndTeamData.dto';
import { ApiProperty } from '@nestjs/swagger';

export class ApplyCodeReviewPresetDto {
    @ApiProperty({ description: 'Code review preset (e.g., STRICT, BALANCED, LOOSE)', example: 'STRICT' })
    @IsEnum(ReviewPreset)
    preset: ReviewPreset;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsNotEmpty()
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Organization and team context data', example: { teamId: 'team_123', organizationId: 'org_456' }, required: false })
    @IsOptional()
    organizationAndTeamData?: OrganizationAndTeamDataDto;
}
