import { AutomationType } from '@libs/automation/domain/automation/enum/automation-type';
import { ApiProperty } from '@nestjs/swagger';
import {
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';

export class AutomationRunDto {
    @ApiProperty({
        description: 'Automation type to execute',
        example: 'CODE_REVIEW',
    })
    @IsEnum(AutomationType)
    automationName: AutomationType;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsNotEmpty()
    @IsUUID()
    teamId: string;

    @ApiProperty({
        description: 'Channel ID for notifications (e.g., Slack channel)',
        example: 'C1234567890',
        required: false,
    })
    @IsString()
    @IsOptional()
    channelId?: string;

    @ApiProperty({
        description: 'Organization unique identifier',
        example: 'org_456def',
        required: false,
    })
    @IsString()
    @IsOptional()
    organizationId?: string;
}
