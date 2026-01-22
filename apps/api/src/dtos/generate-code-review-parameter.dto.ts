import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

import { AlignmentLevel } from '@libs/code-review/domain/types/commentAnalysis.type';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateCodeReviewParameterDTO {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Comment alignment level (e.g., CONSERVATIVE, MODERATE, AGGRESSIVE)', example: 'MODERATE', required: false })
    @IsEnum(AlignmentLevel)
    @IsOptional()
    alignmentLevel?: AlignmentLevel;

    @ApiProperty({ description: 'Number of months of historical data', example: 6, required: false })
    @IsNumber()
    @IsOptional()
    months?: number;

    @ApiProperty({ description: 'Number of weeks of historical data', example: 4, required: false })
    @IsNumber()
    @IsOptional()
    weeks?: number;

    @ApiProperty({ description: 'Number of days of historical data', example: 30, required: false })
    @IsNumber()
    @IsOptional()
    days?: number;
}
