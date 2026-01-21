import { IsString, IsOptional, IsArray, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BackfillPRsDto {
    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsString()
    public teamId: string;

    @ApiProperty({ description: 'repositoryIds', example: 'repositoryIds_example', required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    public repositoryIds?: string[];

    @ApiProperty({ description: 'startDate', example: 'startDate_example', required: false })
    @IsOptional()
    @IsDateString()
    public startDate?: string;

    @ApiProperty({ description: 'endDate', example: 'endDate_example', required: false })
    @IsOptional()
    @IsDateString()
    public endDate?: string;
}
