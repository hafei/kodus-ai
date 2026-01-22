import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FindSuggestionsByRuleDto {
    @ApiProperty({ description: 'Kody rule unique identifier', example: 'rule_abc123' })
    @IsNotEmpty()
    @IsString()
    readonly ruleId: string;
}
