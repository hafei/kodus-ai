import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { STATUS } from '@libs/core/infrastructure/config/types/database/status.type';
import { Role } from '@libs/identity/domain/permissions/enums/permissions.enum';

export class UpdateUserDto {
    @ApiProperty({
        description: 'Updated user email',
        example: 'bob@example.com',
        required: false,
    })
    @IsString()
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiProperty({
        description: 'New password (min 8 characters with uppercase, lowercase, number, and symbol)',
        example: 'NewSecurePass456!',
        required: false,
    })
    @IsString()
    @IsOptional()
    password?: string;

    @ApiProperty({
        description: 'User account status',
        example: 'ACTIVE',
        required: false,
    })
    @IsOptional()
    @IsEnum(STATUS)
    status?: STATUS;

    @ApiProperty({
        description: 'User role in organization',
        example: 'ADMIN',
        required: false,
    })
    @IsOptional()
    @IsEnum(Role)
    role?: Role;
}
