import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

import { AlignmentLevel } from '@libs/code-review/domain/types/commentAnalysis.type';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateCodeReviewParameterDTO {
    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'alignmentLevel', example: 'alignmentLevel_example', required: false })
    @IsEnum(AlignmentLevel)
    @IsOptional()
    alignmentLevel?: AlignmentLevel;

    @ApiProperty({ description: 'months', example: 123, required: false })
    @IsNumber()
    @IsOptional()
    months?: number;

    @ApiProperty({ description: 'weeks', example: 123, required: false })
    @IsNumber()
    @IsOptional()
    weeks?: number;

    @ApiProperty({ description: 'days', example: 123, required: false })
    @IsNumber()
    @IsOptional()
    days?: number;
}
