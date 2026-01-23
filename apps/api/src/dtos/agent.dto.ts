import { IsString, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { OrganizationAndTeamDataDto } from '@libs/core/domain/dtos/organizationAndTeamData.dto';

export class ConversationDto {
    @ApiProperty({ description: 'User prompt message', example: 'How do I fix this code issue?' })
    @IsString()
    prompt: string;

    @ApiProperty({ description: 'Organization and team context data', type: OrganizationAndTeamDataDto })
    @ValidateNested()
    @Type(() => OrganizationAndTeamDataDto)
    organizationAndTeamData: OrganizationAndTeamDataDto;
}
