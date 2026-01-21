import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CopyCodeReviewParameterDTO {
    @ApiProperty({ description: 'sourceRepositoryId', example: 'sourceRepositoryId_example' })
    @IsString()
    sourceRepositoryId: string;

    @ApiProperty({ description: 'targetRepositoryId', example: 'targetRepositoryId_example' })
    @IsString()
    targetRepositoryId: string;

    @ApiProperty({ description: 'targetDirectoryPath', example: 'targetDirectoryPath_example' })
    @IsString()
    @IsOptional()
    targetDirectoryPath: string;

    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsString()
    teamId: string;
}
