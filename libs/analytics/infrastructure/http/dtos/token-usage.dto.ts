import { IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TokenUsageQueryDto {
    @ApiProperty({ description: 'Organization unique identifier', example: 'org_123abc' })
    @IsString()
    organizationId: string;

    @ApiProperty({ description: 'Start date (ISO 8601 format)', example: '2024-01-01T00:00:00Z' })
    @IsISO8601()
    startDate: string;

    @ApiProperty({ description: 'End date (ISO 8601 format)', example: '2024-12-31T23:59:59Z' })
    @IsISO8601()
    endDate: string;

    @ApiProperty({ description: 'Comma-separated list of model names to filter', example: 'gpt-4,claude-3', required: false })
    @IsOptional()
    @IsString()
    models?: string;

    @ApiProperty({ description: 'Pull request number filter', example: 123, required: false })
    @IsOptional()
    @IsNumber()
    prNumber?: number;

    @ApiProperty({ description: 'Timezone for date calculations', example: 'America/Sao_Paulo', required: false })
    @IsOptional()
    @IsString()
    timezone?: string;

    @ApiProperty({ description: 'Developer email or username filter', example: 'alice@example.com', required: false })
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

    @ApiProperty({ description: 'Provider name (e.g., openai, anthropic)', example: 'openai', required: false })
    @IsString()
    @IsOptional()
    provider?: string;
}
