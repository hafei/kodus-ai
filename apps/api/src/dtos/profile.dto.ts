import { ApiProperty } from '@nestjs/swagger';

export class ProfileDto {
    @ApiProperty({ description: 'Full name', example: 'Alice Doe' })
    public readonly name: string;

    @ApiProperty({ description: 'Phone number', example: '+1-555-1234' })
    public readonly phone: string;

    @ApiProperty({
        description: 'Profile image URL',
        example: 'https://example.com/avatar.png',
        required: false,
    })
    public readonly img?: string;
}
