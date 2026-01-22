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

    @ApiProperty({
        description: 'Comma-separated list of model names to filter',
        example: 'gpt-4,claude-3',
        required: false,
    })
    @IsOptional()
    @IsString()
    models?: string;

    @ApiProperty({ description: 'Pull request number filter', example: 123, required: false })
    @IsOptional()
    @IsNumber()
    prNumber?: number;

    @IsOptional()
    @IsString()
    timezone?: string; // e.g., 'UTC' or 'America/Sao_Paulo'

    @ApiProperty({
        description: 'Developer email or username filter',
        example: 'alice@example.com',
        required: false,
    })
    @IsOptional()
    @IsString()
    developer?: string;

    @ApiProperty({ description: 'Bring Your Own Key identifier', example: 'byok_config_123' })
    @IsString()
    byok: string;
}

export class TokenPricingQueryDto {
    @ApiProperty({ description: 'Model name (e.g., gpt-4, claude-3)', example: 'gpt-4' })
    @IsString()
    model: string;

    @ApiProperty({
        description: 'Provider name (e.g., openai, anthropic)',
        example: 'openai',
        required: false,
    })
    @IsString()
    @IsOptional()
    provider?: string;
}
