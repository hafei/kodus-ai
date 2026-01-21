import { IsArray, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewFastKodyRulesDto {
    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'activateRuleIds', example: 'activateRuleIds_example', required: false })
    @IsOptional()
    @IsArray()
    activateRuleIds?: string[];

    @ApiProperty({ description: 'deleteRuleIds', example: 'deleteRuleIds_example', required: false })
    @IsOptional()
    @IsArray()
    deleteRuleIds?: string[];
}
