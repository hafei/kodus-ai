import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { PaginationDto } from '@libs/core/domain/dtos/pagination.dto';
import {
    ActionType,
    ConfigLevel,
} from '@libs/core/infrastructure/config/types/general/codeReviewSettingsLog.type';

export class CodeReviewSettingsLogFiltersDto extends PaginationDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc', required: false })
    @IsOptional()
    @IsUUID()
    teamId?: string;

    @ApiProperty({ description: 'Action type filter', example: 'CREATE', required: false })
    @IsOptional()
    @IsEnum(ActionType)
    action?: ActionType;

    @ApiProperty({ description: 'Configuration level filter', example: 'REPOSITORY', required: false })
    @IsOptional()
    @IsEnum(ConfigLevel)
    configLevel?: ConfigLevel;

    @ApiProperty({ description: 'User unique identifier filter', example: 'user_789xyz', required: false })
    @IsOptional()
    @IsString()
    userId?: string;

    @ApiProperty({ description: 'User email filter', example: 'alice@example.com', required: false })
    @IsOptional()
    @IsString()
    userEmail?: string;

    @ApiProperty({ description: 'Repository unique identifier filter', example: 'repo_456ghi', required: false })
    @IsOptional()
    @IsString()
    repositoryId?: string;

    @ApiProperty({ description: 'Start date filter (ISO 8601)', example: '2024-01-01T00:00:00Z', required: false })
    @IsOptional()
    @Transform(({ value }) => new Date(value))
    startDate?: Date;

    @ApiProperty({ description: 'End date filter (ISO 8601)', example: '2024-12-31T23:59:59Z', required: false })
    @IsOptional()
    @Transform(({ value }) => new Date(value))
    endDate?: Date;
}
