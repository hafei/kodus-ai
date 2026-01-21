import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateKodyRulesDTO {
    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsString()
    teamId: string;

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

    @ApiProperty({ description: 'repositoriesIds', example: 'repositoriesIds_example', required: false })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    repositoriesIds?: string[];
}
