import { IsEnum } from 'class-validator';

import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';
import { ApiProperty } from '@nestjs/swagger';

export class PlatformTypeDto {
    @ApiProperty({ description: 'Platform type (e.g., GITHUB, GITLAB)', example: 'GITHUB' })
    @IsEnum(PlatformType)
    platformType: PlatformType;
}
