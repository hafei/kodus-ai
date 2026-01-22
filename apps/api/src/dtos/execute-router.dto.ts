import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExecuteRouterDto {
    @ApiProperty({ description: 'Router configuration object', example: '{ path: "/users", method: "GET" }' })
    @IsObject()
    router: any;

    @ApiProperty({ description: 'Message to be processed', example: 'Review my code for bugs' })
    @IsString()
    message: string;

    @ApiProperty({ description: 'User unique identifier', example: 'user_123abc' })
    @IsString()
    userId: string;

    @ApiProperty({ description: 'Communication channel identifier', example: 'slack_general' })
    @IsString()
    channel: string;

    @ApiProperty({ description: 'Session unique identifier', example: 'session_456xyz' })
    @IsString()
    sessionId: string;

    @ApiProperty({ description: 'User display name', example: 'Alice Johnson' })
    @IsString()
    userName: string;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc', required: false })
    @IsUUID()
    @IsOptional()
    teamId?: string;

    @ApiProperty({ description: 'Organization unique identifier', example: 'org_456def', required: false })
    @IsUUID()
    @IsOptional()
    organizationId?: string;
}
