import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FindSuggestionsByRuleDto {
    @ApiProperty({ description: 'Rule ID', example: 'rule_123' })
    @IsNotEmpty()
    @IsString()
    readonly ruleId: string;
}
