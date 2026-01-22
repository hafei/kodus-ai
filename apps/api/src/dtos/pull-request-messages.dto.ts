import { IsObject, IsOptional, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';
import {
    PullRequestMessageStatus,
    PullRequestMessageType,
} from '@libs/core/infrastructure/config/types/general/pullRequestMessages.type';

export class PullRequestMessagesDto {
    @ApiProperty({
        description: 'Organization unique identifier',
        example: 'org_123abc',
        required: false,
    })
    @IsString()
    public organizationId?: string;

    @ApiProperty({
        description: 'Type of pull request message (e.g., START, END)',
        example: 'START',
    })
    @IsString()
    public pullRequestMessageType: PullRequestMessageType;

    @ApiProperty({ description: 'Message status (e.g., ACTIVE, INACTIVE)', example: 'ACTIVE' })
    @IsString()
    public status: PullRequestMessageStatus;

    @ApiProperty({ description: 'Message content', example: 'Code review started...' })
    @IsOptional()
    @IsString()
    public content: string;

    @ApiProperty({ description: 'Repository information', example: { id: 'repo_123', name: 'my-repo' } })
    @IsObject()
    public repository?: { id: string; name: string };
}
