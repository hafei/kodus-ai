import {
    IsEmail,
    IsOptional,
    IsString,
    IsStrongPassword,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignUpDTO {
    @ApiProperty({ description: 'User full name', example: 'Alice Johnson' })
    @IsString()
    public name: string;

    @ApiProperty({ description: 'User email address', example: 'alice@example.com' })
    @IsString()
    @IsEmail()
    public email: string;

    @ApiProperty({ description: 'User password (min 8 chars with uppercase, lowercase, number, and symbol)', example: 'SecurePass456!' })
    @IsString()
    @IsStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
    })
    public password: string;

    @ApiProperty({ description: 'Organization unique identifier to join', example: 'org_456def', required: false })
    @IsString()
    @IsOptional()
    public organizationId?: string;
}
