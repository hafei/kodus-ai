import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteRepositoryCodeReviewParameterDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi' })
    @IsString()
    repositoryId: string;

    @ApiProperty({ description: 'Directory unique identifier', example: 'dir_xyz', required: false })
    @IsOptional()
    @IsString()
    directoryId: string;
}
