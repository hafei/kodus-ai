import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConversationDto {
    @ApiProperty({
        description: 'New conversation message',
        example: 'Thanks, please check the edge case for null input.',
    })
    @IsString()
    public message: string;
}
