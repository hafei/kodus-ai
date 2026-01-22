import { IsEnum, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { STATUS } from '@libs/core/infrastructure/config/types/database/status.type';
import { Role } from '@libs/identity/domain/permissions/enums/permissions.enum';

export class UpdateAnotherUserDto {
    @ApiProperty({ description: 'User account status', example: 'ACTIVE', required: false })
    @IsOptional()
    @IsEnum(STATUS)
    status?: STATUS;

    @ApiProperty({ description: 'User role in organization', example: 'MEMBER', required: false })
    @IsOptional()
    @IsEnum(Role)
    role?: Role;
}
