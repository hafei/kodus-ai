import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class JoinOrganizationDto {
    @ApiProperty({ description: 'User unique identifier', example: 'user_123abc' })
    @IsUUID()
    userId: string;

    @ApiProperty({ description: 'Organization unique identifier', example: 'org_456def' })
    @IsUUID()
    organizationId: string;
}
