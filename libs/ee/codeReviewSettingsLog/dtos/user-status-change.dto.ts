import { IsObject, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UserStatusDto {
    @ApiProperty({ description: 'Git platform user ID', example: '12345' })
    @IsString()
    public gitId: string;

    @ApiProperty({ description: 'Git platform name', example: 'github' })
    @IsString()
    public gitTool: string;

    @ApiProperty({ description: 'License status', example: 'active' })
    @IsString()
    public licenseStatus: 'active' | 'inactive';

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    public teamId: string;

    @ApiProperty({ description: 'Organization unique identifier', example: 'org_456def' })
    @IsString()
    public organizationId: string;

    @ApiProperty({ description: 'User who made the change', example: { userId: 'user_1', email: 'alice@example.com' } })
    @IsObject()
    public editedBy: {
        userId: string;
        email: string;
    };

    @ApiProperty({ description: 'User display name', example: 'Alice Johnson' })
    @IsString()
    public userName: string;
}
