import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class IntegrationDataDto {
    @ApiProperty({ description: 'Platform type', example: 'github' })
    @IsString()
    platform: string;

    @ApiProperty({ description: 'Integration category', example: 'code_management' })
    @IsString()
    category: string;
}

export class CloneIntegrationDto {
    @ApiProperty({ description: 'Source team ID', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Target team ID to clone to', example: 'team_456def' })
    @IsString()
    teamIdClone: string;

    @ApiProperty({ description: 'Integration data to clone', type: IntegrationDataDto })
    @ValidateNested()
    @Type(() => IntegrationDataDto)
    integrationData: IntegrationDataDto;
}

export class CheckConnectionPlatformDto {
    @ApiProperty({ description: 'Platform type to check', example: 'github' })
    @IsString()
    platform: string;

    @ApiPropertyOptional({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsOptional()
    @IsString()
    teamId?: string;

    @ApiPropertyOptional({ description: 'Integration category', example: 'code_management' })
    @IsOptional()
    @IsString()
    category?: string;
}
