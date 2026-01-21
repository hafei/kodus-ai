import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class updatePullRequestDto {
    @ApiProperty({
        description: 'Associated team id',
        example: 'team_123',
        required: false,
    })
    @IsString()
    @IsOptional()
    public teamId?: string;

    @IsString()
    public organizationId: string;
}
