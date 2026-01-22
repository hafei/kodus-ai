import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsArray,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
    Max,
} from 'class-validator';

export class OnboardingReviewModeSignalsQueryDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
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
    @ApiProperty({
        description: 'List of repository identifiers',
        example: ['repo_1', 'repo_2'],
    })
    repositoryIds: string[];

    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @Min(1)
    @Max(50)
    limit?: number = 10;
}
