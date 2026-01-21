import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConversationDto {
    @ApiProperty({
        description: 'New conversation message',
        @ApiProperty({ description: 'example', example: 'example_example' })
        example: 'Thanks, please check the edge case for null input.',
    })
    @ApiProperty({ description: 'message', example: 'message_example' })
    @IsString()
    public message: string;
}
