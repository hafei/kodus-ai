import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
    @ApiProperty({
        description: 'User email address',
        @ApiProperty({ description: 'example', example: 'example_example' })
        example: 'alice@example.com',
    })
    @ApiProperty({ description: 'email', example: 'email_example' })
    @IsString()
    @IsEmail()
    public email: string;

    @ApiProperty({ description: 'password', example: 'password_example' })
    @IsString()
    @IsOptional()
    public password: string;

    @ApiProperty({ description: 'status', example: true, required: false })
    @IsBoolean()
    @IsOptional()
    public status?: boolean;
}
