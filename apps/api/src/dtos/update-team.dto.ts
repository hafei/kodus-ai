import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTeamDto {
    @ApiProperty({ description: 'teamName', example: 'teamName_example' })
    @IsString()
    teamName: string;

    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsString()
    teamId: string;
}
