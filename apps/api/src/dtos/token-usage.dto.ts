import { IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TokenUsageQueryDto {
    @ApiProperty({
        description: 'Start date (ISO8601)',
        @ApiProperty({ description: 'example', example: 'example_example' })
        example: '2025-01-01T00:00:00Z',
    })
    @IsISO8601()
    startDate: string; // ISO date string

    @IsISO8601()
    endDate: string; // ISO date string

    @ApiProperty({ description: 'models', example: 'models_example', required: false })
    @IsOptional()
    @IsString()
    models?: string;

    @ApiProperty({ description: 'prNumber', example: 123, required: false })
    @IsOptional()
    @IsNumber()
    prNumber?: number;

    @IsOptional()
    @IsString()
    timezone?: string; // e.g., 'UTC' or 'America/Sao_Paulo'

    @ApiProperty({ description: 'developer', example: 'developer_example', required: false })
    @IsOptional()
    @IsString()
    developer?: string;

    @ApiProperty({ description: 'byok', example: 'byok_example' })
    @IsString()
    byok: string;
}

export class TokenPricingQueryDto {
    @ApiProperty({ description: 'model', example: 'model_example' })
    @IsString()
    model: string;

    @ApiProperty({ description: 'provider', example: 'provider_example', required: false })
    @IsString()
    @IsOptional()
    provider?: string;
}
