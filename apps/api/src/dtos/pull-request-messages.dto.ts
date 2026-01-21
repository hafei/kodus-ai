import { IsObject, IsOptional, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';
import {
    PullRequestMessageStatus,
    PullRequestMessageType,
} from '@libs/core/infrastructure/config/types/general/pullRequestMessages.type';

export class PullRequestMessagesDto {
    @ApiProperty({
        description: 'organizationId',
        example: 'organizationId_example',
        required: false,
    })
    @IsString()
    public organizationId?: string;

    @ApiProperty({
        description: 'pullRequestMessageType',
        example: 'pullRequestMessageType_example',
    })
    @IsString()
    public pullRequestMessageType: PullRequestMessageType;

    @ApiProperty({ description: 'status', example: 'status_example' })
    @IsString()
    public status: PullRequestMessageStatus;

    @ApiProperty({ description: 'content', example: 'content_example' })
    @IsOptional()
    @IsString()
    public content: string;

    @IsObject()
    public repository?: { id: string; name: string };
}
