import { IsString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignReposDto {
    @ApiProperty({ description: 'List of repository IDs to assign', type: [String], example: ['repo_123', 'repo_456'] })
    @IsArray()
    @IsString({ each: true })
    repositoryIds: string[];

    @ApiProperty({ description: 'User ID to assign repositories to', example: 'user_abc123' })
    @IsString()
    userId: string;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;
}
