import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IntegrationSlackDto {
    @ApiProperty({ description: 'code', example: 'code_example' })
    @IsString()
    public code: string;
}
