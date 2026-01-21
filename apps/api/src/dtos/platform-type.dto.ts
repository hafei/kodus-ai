import { IsEnum } from 'class-validator';

import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';
import { ApiProperty } from '@nestjs/swagger';

export class PlatformTypeDto {
    @ApiProperty({ description: 'platformType', example: 'platformType_example' })
    @IsEnum(PlatformType)
    platformType: PlatformType;
}
