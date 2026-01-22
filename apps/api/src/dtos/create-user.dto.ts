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

    @ApiProperty({ description: 'User password (min 8 characters)', example: 'SecurePass123!', required: false })
    @IsString()
    @IsOptional()
    public password: string;

    @ApiProperty({ description: 'User account status (active/inactive)', example: true, required: false })
    @IsBoolean()
    @IsOptional()
    public status?: boolean;
}
