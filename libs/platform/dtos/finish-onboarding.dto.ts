import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FinishOnboardingDTO {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Whether to review a pull request during onboarding', example: true })
    @IsBoolean()
    reviewPR: boolean;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi', required: false })
    @IsOptional()
    @IsString()
    repositoryId?: string;

    @ApiProperty({ description: 'Repository name', example: 'my-repo', required: false })
    @IsOptional()
    @IsString()
    repositoryName?: string;

    @ApiProperty({ description: 'Pull request number to review', example: 123, required: false })
    @IsOptional()
    @IsNumber()
    pullNumber?: number;
}
