import { IsString, IsOptional, IsArray, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BackfillPRsDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    public teamId: string;

    @ApiProperty({ description: 'List of repository identifiers to backfill', example: ['repo_1', 'repo_2'], required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    public repositoryIds?: string[];

    @ApiProperty({ description: 'Start date for PR backfill (ISO 8601 format)', example: '2024-01-01T00:00:00Z', required: false })
    @IsOptional()
    @IsDateString()
    public startDate?: string;

    @ApiProperty({ description: 'End date for PR backfill (ISO 8601 format)', example: '2024-12-31T23:59:59Z', required: false })
    @IsOptional()
    @IsDateString()
    public endDate?: string;
}
