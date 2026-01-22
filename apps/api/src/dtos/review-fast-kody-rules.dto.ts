import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewFastKodyRulesDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'List of rule IDs to activate', example: ['rule_1', 'rule_2'], required: false })
    @IsOptional()
    @IsArray()
    activateRuleIds?: string[];

    @ApiProperty({ description: 'List of rule IDs to delete', example: ['rule_3', 'rule_4'], required: false })
    @IsOptional()
    @IsArray()
    deleteRuleIds?: string[];
}
