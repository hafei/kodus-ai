import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookStatusQueryDto {
    @ApiProperty({ description: 'Organization ID', example: 'org_123' })
    @IsString()
    @IsNotEmpty()
    readonly organizationId: string;

    @IsString()
    @IsNotEmpty()
    readonly teamId: string;

    @IsString()
    @IsNotEmpty()
    readonly repositoryId: string;
}
