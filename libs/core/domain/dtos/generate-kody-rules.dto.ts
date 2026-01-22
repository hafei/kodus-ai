import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateKodyRulesDTO {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

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

    @ApiProperty({ description: 'List of repository identifiers', example: ['repo_1', 'repo_2'], required: false })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    repositoriesIds?: string[];
}
