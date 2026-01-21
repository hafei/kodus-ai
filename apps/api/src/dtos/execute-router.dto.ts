import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExecuteRouterDto {
    @ApiProperty({ description: 'router', example: 'router_example' })
    @IsObject()
    router: any;

    @ApiProperty({ description: 'message', example: 'message_example' })
    @IsString()
    message: string;

    @ApiProperty({ description: 'userId', example: 'userId_example' })
    @IsString()
    userId: string;

    @ApiProperty({ description: 'channel', example: 'channel_example' })
    @IsString()
    channel: string;

    @ApiProperty({ description: 'sessionId', example: 'sessionId_example' })
    @IsString()
    sessionId: string;

    @ApiProperty({ description: 'userName', example: 'userName_example' })
    @IsString()
    userName: string;

    @ApiProperty({ description: 'teamId', example: 'teamId_example', required: false })
    @IsUUID()
    @IsOptional()
    teamId?: string;

    @ApiProperty({ description: 'organizationId', example: 'organizationId_example', required: false })
    @IsUUID()
    @IsOptional()
    organizationId?: string;
}
