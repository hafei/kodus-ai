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

    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsString()
    public teamId: string;
}
