import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IntegrationSlackDto {
    @ApiProperty({ description: 'Slack OAuth authorization code', example: 'AUTHORIZATION_CODE_789' })
    @IsString()
    public code: string;
}
