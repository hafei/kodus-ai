import { IsEmail, IsString, IsEnum } from 'class-validator';

import { AuthProvider } from '@libs/core/domain/enums/auth-provider.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserOrganizationOAuthDto {
    @ApiProperty({ description: 'User full name', example: 'Alice Johnson' })
    @IsString()
    public name: string;

    @ApiProperty({ description: 'User email address', example: 'alice@example.com' })
    @IsString()
    @IsEmail()
    public email: string;

    @ApiProperty({ description: 'OAuth refresh token from provider', example: 'refresh_token_xyz' })
    @IsString()
    public refreshToken: string;

    @ApiProperty({ description: 'Authentication provider (e.g., GITHUB, GITLAB)', example: 'GITHUB' })
    @IsEnum(AuthProvider)
    public authProvider: AuthProvider;
}
