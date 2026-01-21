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

    @IsString()
    @IsOptional()
    public password: string;

    @IsBoolean()
    @IsOptional()
    public status?: boolean;
}
