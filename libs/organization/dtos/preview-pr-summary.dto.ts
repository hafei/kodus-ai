import { BehaviourForExistingDescription } from '@libs/core/infrastructure/config/types/general/codeReview.type';
import {
    IsEnum,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PreviewPrSummaryDto {
    @ApiProperty({ description: 'Pull request number', example: '123' })
    @IsNotEmpty()
    @IsString()
    prNumber: string;

    @ApiProperty({ description: 'Repository information', example: { id: 'repo_123', name: 'my-repo' } })
    @IsNotEmpty()
    @IsObject()
    repository: {
        id: string;
        name: string;
    };

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsNotEmpty()
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Behavior for existing PR description', example: 'OVERWRITE' })
    @IsNotEmpty()
    @IsEnum(BehaviourForExistingDescription)
    behaviourForExistingDescription: BehaviourForExistingDescription;

    @ApiProperty({ description: 'Custom instructions for PR summary generation', example: 'Focus on performance improvements', required: false })
    @IsOptional()
    @IsString()
    customInstructions: string;
}
