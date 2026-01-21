import { IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TokenUsageQueryDto {
    @ApiProperty({
        description: 'Start date (ISO8601)',
        example: '2025-01-01T00:00:00Z',
    })
    @IsISO8601()
    startDate: string; // ISO date string

    @IsISO8601()
    endDate: string; // ISO date string

    @IsOptional()
    @IsString()
    models?: string;

    @IsOptional()
    @IsNumber()
    prNumber?: number;

    @IsOptional()
    @IsString()
    timezone?: string; // e.g., 'UTC' or 'America/Sao_Paulo'

    @IsOptional()
    @IsString()
    developer?: string;

    @IsString()
    byok: string;
}

export class TokenPricingQueryDto {
    @IsString()
    model: string;

    @IsString()
    @IsOptional()
    provider?: string;
}
