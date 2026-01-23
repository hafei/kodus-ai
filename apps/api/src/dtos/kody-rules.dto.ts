import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncIdeRulesDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi' })
    @IsString()
    repositoryId: string;
}

export class FastSyncIdeRulesDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi' })
    @IsString()
    repositoryId: string;

    @ApiPropertyOptional({ description: 'Maximum number of files to sync', example: 100 })
    @IsOptional()
    @IsNumber()
    maxFiles?: number;

    @ApiPropertyOptional({ description: 'Maximum file size in bytes', example: 1048576 })
    @IsOptional()
    @IsNumber()
    maxFileSizeBytes?: number;

    @ApiPropertyOptional({ description: 'Maximum total bytes to process', example: 10485760 })
    @IsOptional()
    @IsNumber()
    maxTotalBytes?: number;
}
