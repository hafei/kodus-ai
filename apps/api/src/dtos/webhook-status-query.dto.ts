import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebhookStatusQueryDto {
    @ApiProperty({ description: 'Organization unique identifier', example: 'org_123abc' })
    @IsString()
    @IsNotEmpty()
    readonly organizationId: string;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_456def' })
    @IsString()
    @IsNotEmpty()
    readonly teamId: string;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi' })
    @IsString()
    @IsNotEmpty()
    readonly repositoryId: string;
}
