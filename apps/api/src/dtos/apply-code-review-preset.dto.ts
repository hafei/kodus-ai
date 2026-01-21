import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { ReviewPreset } from '@libs/core/infrastructure/config/types/general/codeReview.type';
import { OrganizationAndTeamDataDto } from '@libs/core/domain/dtos/organizationAndTeamData.dto';
import { ApiProperty } from '@nestjs/swagger';

export class ApplyCodeReviewPresetDto {
    @ApiProperty({ description: 'preset', example: 'preset_example' })
    @IsEnum(ReviewPreset)
    preset: ReviewPreset;

    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsNotEmpty()
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'organizationAndTeamData', example: 'organizationAndTeamData_example', required: false })
    @IsOptional()
    organizationAndTeamData?: OrganizationAndTeamDataDto;
}
