import { Transform } from 'class-transformer';
import {
import { ApiProperty } from '@nestjs/swagger';
    IsArray,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
    Max,
} from 'class-validator';

export class OnboardingReviewModeSignalsQueryDto {
    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsNotEmpty()
    @IsString()
    teamId: string;

    @IsArray()
    @IsString({ each: true })
    @Transform(({ value }) => {
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            return value
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean);
        }
        return [];
    })
    @ApiProperty({ description: 'repositoryIds', example: 'repositoryIds_example' })
    repositoryIds: string[];

    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @Min(1)
    @Max(50)
    limit?: number = 10;
}
