import { KodyRulesStatus } from '@libs/kodyRules/domain/interfaces/kodyRules.interface';
import { IsArray, IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeStatusKodyRulesDTO {
    @ApiProperty({ description: 'List of rule unique identifiers', example: ['rule_1', 'rule_2'] })
    @IsArray()
    @IsString({ each: true })
    ruleIds: string[];

    @ApiProperty({ description: 'New status for rules', example: 'ACTIVE' })
    @IsEnum(KodyRulesStatus)
    status: KodyRulesStatus;
}
