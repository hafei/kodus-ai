import { TeamQueryDto } from '@libs/organization/dtos/teamId-query.dto';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsNotEmpty,
    IsString,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AutomationDto {
    @ApiProperty({ description: 'Automation unique identifier', example: 'auto_123abc' })
    @IsUUID()
    @IsNotEmpty()
    automationUuid: string;

    @ApiProperty({ description: 'Automation type (e.g., CODE_REVIEW)', example: 'CODE_REVIEW' })
    @IsString()
    @IsNotEmpty()
    automationType: string;

    @ApiProperty({ description: 'Automation status (enabled/disabled)', example: true })
    @IsBoolean()
    @IsNotEmpty()
    status: boolean;
}

export class TeamAutomationsDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_456def' })
    @Type(() => TeamQueryDto)
    teamId: string;

    @ApiProperty({ description: 'List of automations', example: [{ automationUuid: 'auto_1', automationType: 'CODE_REVIEW', status: true }] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AutomationDto)
    automations: AutomationDto[];
}

export class OrganizationAutomationsDto {
    @ApiProperty({ description: 'Organization unique identifier', example: 'org_789ghi' })
    @Type(() => TeamQueryDto)
    organizationId: string;

    @ApiProperty({ description: 'List of automations', example: [{ automationUuid: 'auto_1', automationType: 'CODE_REVIEW', status: true }] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AutomationDto)
    automations: AutomationDto[];
}
