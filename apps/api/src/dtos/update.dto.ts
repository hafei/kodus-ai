import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { STATUS } from '@libs/core/infrastructure/config/types/database/status.type';
import { Role } from '@libs/identity/domain/permissions/enums/permissions.enum';

export class UpdateUserDto {
    @ApiProperty({
        description: 'Updated user email',
        @ApiProperty({ description: 'example', example: 'example_example' })
        example: 'bob@example.com',
        @ApiProperty({ description: 'required', example: 'required_example' })
        required: false,
    })
    @ApiProperty({ description: 'email', example: 'email_example', required: false })
    @IsString()
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiProperty({ description: 'password', example: 'password_example', required: false })
    @IsString()
    @IsOptional()
    password?: string;

    @ApiProperty({ description: 'status', example: 'status_example', required: false })
    @IsOptional()
    @IsEnum(STATUS)
    status?: STATUS;

    @ApiProperty({ description: 'role', example: 'role_example', required: false })
    @IsOptional()
    @IsEnum(Role)
    role?: Role;
}
