import { Transform } from 'class-transformer';
import { IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationDto {
    @ApiProperty({ description: 'Page number (starts from 1)', example: 1, required: false })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsNumber()
    @Min(1)
    page?: number = 1;

    @ApiProperty({ description: 'Number of items per page (max 1000)', example: 20, required: false })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsNumber()
    @Min(1)
    @Max(1000)
    limit?: number = 100;

    @ApiProperty({ description: 'Number of items to skip', example: 0, required: false })
    @IsOptional()
    @Transform(({ value }) => parseInt(value))
    @IsNumber()
    @Min(0)
    skip?: number;
}
