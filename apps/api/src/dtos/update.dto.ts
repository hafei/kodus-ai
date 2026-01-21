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

    @IsString()
    @IsOptional()
    password?: string;

    @IsOptional()
    @IsEnum(STATUS)
    status?: STATUS;

    @IsOptional()
    @IsEnum(Role)
    role?: Role;
}
