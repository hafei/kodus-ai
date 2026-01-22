import {
    IsNotEmpty,
    IsOptional,
    IsString,
    IsStrongPassword,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AcceptUserInvitationDto {
    @ApiProperty({ description: 'User invitation unique identifier', example: 'invite_123abc' })
    @IsNotEmpty()
    public uuid: string;

    @ApiProperty({ description: 'User full name', example: 'Alice Johnson' })
    @IsString()
    public name: string;

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

    @ApiProperty({ description: 'Phone number', example: '+1-555-1234', required: false })
    @IsString()
    @IsOptional()
    public phone?: string;
}
