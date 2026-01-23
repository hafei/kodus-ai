import { IsString, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({ description: 'User email address', example: 'user@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ description: 'User password', example: 'securePassword123' })
    @IsString()
    password: string;
}

export class LogoutDto {
    @ApiProperty({ description: 'Refresh token to invalidate', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
    @IsString()
    refreshToken: string;
}

export class RefreshTokenDto {
    @ApiProperty({ description: 'Refresh token for obtaining new access token', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
    @IsString()
    refreshToken: string;
}

export class ForgotPasswordDto {
    @ApiProperty({ description: 'Email address for password reset', example: 'user@example.com' })
    @IsEmail()
    email: string;
}

export class ResetPasswordDto {
    @ApiProperty({ description: 'Password reset token from email', example: 'reset_token_abc123' })
    @IsString()
    token: string;

    @ApiProperty({ description: 'New password to set', example: 'newSecurePassword456' })
    @IsString()
    newPassword: string;
}

export class ConfirmEmailDto {
    @ApiProperty({ description: 'Email confirmation token', example: 'confirm_token_xyz789' })
    @IsString()
    token: string;
}

export class ResendEmailDto {
    @ApiProperty({ description: 'Email address to resend confirmation', example: 'user@example.com' })
    @IsEmail()
    email: string;
}
