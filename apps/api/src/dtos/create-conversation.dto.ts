import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateConversationDto {
    @ApiProperty({
        description: 'Initial prompt for the conversation',
        example: 'Please review my PR and highlight potential bugs.',
    })
    @IsString()
    @MinLength(3)
    public prompt: string;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    public teamId: string;
}
