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
        description: 'automationName',
        example: 'automationName_example',
    })
    @IsEnum(AutomationType)
    automationName: AutomationType;

    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsNotEmpty()
    @IsUUID()
    teamId: string;

    @ApiProperty({
        description: 'channelId',
        example: 'channelId_example',
        required: false,
    })
    @IsString()
    @IsOptional()
    channelId?: string;

    @ApiProperty({
        description: 'organizationId',
        example: 'organizationId_example',
        required: false,
    })
    @IsString()
    @IsOptional()
    organizationId?: string;
}
