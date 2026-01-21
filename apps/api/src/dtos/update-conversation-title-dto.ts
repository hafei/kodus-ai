import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConversationTitleDto {
    @ApiProperty({ description: 'title', example: 'title_example' })
    @IsString()
    @IsNotEmpty({ message: 'Title should not be empty' })
    public title: string;
}
