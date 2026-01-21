import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OrganizationQueryDto {
    @ApiProperty({ description: 'Organization ID', example: 'org_123' })
    @IsString()
    readonly organizationId: string;
}
