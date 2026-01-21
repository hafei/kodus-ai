import { IsEmail, IsString, IsEnum } from 'class-validator';

import { AuthProvider } from '@libs/core/domain/enums/auth-provider.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserOrganizationOAuthDto {
    @ApiProperty({ description: 'name', example: 'name_example' })
    @IsString()
    public name: string;

    @ApiProperty({ description: 'email', example: 'email_example' })
    @IsString()
    @IsEmail()
    public email: string;

    @ApiProperty({ description: 'refreshToken', example: 'refreshToken_example' })
    @IsString()
    public refreshToken: string;

    @ApiProperty({ description: 'authProvider', example: 'authProvider_example' })
    @IsEnum(AuthProvider)
    public authProvider: AuthProvider;
}
