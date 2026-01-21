import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTeamDto {
    @ApiProperty({ description: 'Team name', example: 'Platform Ops' })
    @IsString()
    teamName: string;

    @ApiProperty({
        description: 'organizationId',
        example: 'organizationId_example',
    })
    @IsString()
    organizationId: string;
}
