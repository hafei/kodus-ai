import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTeamDto {
    @ApiProperty({ description: 'Team name', example: 'Platform Ops' })
    @IsString()
    teamName: string;

    @ApiProperty({
        description: 'Organization unique identifier',
        example: 'org_123abc',
    })
    @IsString()
    organizationId: string;
}
