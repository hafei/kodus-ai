import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
    @ApiProperty({
        description: 'User email address',
        example: 'alice@example.com',
    })
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
