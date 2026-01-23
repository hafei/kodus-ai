import { IsString, IsArray, ValidateNested, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

class CommunicationConfigDto {
    @ApiProperty({ description: 'Communication name', example: 'Slack' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Communication ID', example: 'U12345678' })
    @IsString()
    id: string;

    @ApiPropertyOptional({ description: 'Chat ID', example: 'C12345678' })
    @IsOptional()
    @IsString()
    chatId?: string;
}

class CodeManagementConfigDto {
    @ApiProperty({ description: 'Code management name', example: 'johndoe' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Code management ID', example: '12345' })
    @IsString()
    id: string;
}

class ProjectManagementConfigDto {
    @ApiProperty({ description: 'Project management name', example: 'John Doe' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Project management ID', example: 'user_123' })
    @IsString()
    id: string;
}

class MemberDto {
    @ApiPropertyOptional({ description: 'Member UUID', example: 'member_123abc' })
    @IsOptional()
    @IsString()
    uuid?: string;

    @ApiProperty({ description: 'Whether member is active', example: true })
    @IsBoolean()
    active: boolean;

    @ApiProperty({ description: 'Communication platform ID', example: 'U12345678' })
    @IsString()
    communicationId: string;

    @ApiProperty({ description: 'Team role', enum: ['ADMIN', 'REVIEWER', 'DEVELOPER', 'VIEWER'], example: 'DEVELOPER' })
    @IsString()
    teamRole: string;

    @ApiProperty({ description: 'System role', enum: ['ADMIN', 'USER', 'OWNER'], example: 'USER' })
    @IsString()
    role: string;

    @ApiPropertyOptional({ description: 'Member avatar URL', example: 'https://example.com/avatar.jpg' })
    @IsOptional()
    @IsString()
    avatar?: string;

    @ApiProperty({ description: 'Member name', example: 'John Doe' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ description: 'Communication config', type: CommunicationConfigDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CommunicationConfigDto)
    communication?: CommunicationConfigDto;

    @ApiPropertyOptional({ description: 'Code management config', type: CodeManagementConfigDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CodeManagementConfigDto)
    codeManagement?: CodeManagementConfigDto;

    @ApiPropertyOptional({ description: 'Project management config', type: ProjectManagementConfigDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => ProjectManagementConfigDto)
    projectManagement?: ProjectManagementConfigDto;

    @ApiProperty({ description: 'Member email', example: 'john@example.com' })
    @IsString()
    email: string;

    @ApiPropertyOptional({ description: 'External user ID', example: '12345' })
    @IsOptional()
    @IsString()
    userId?: string;
}

export class CreateOrUpdateTeamMembersDto {
    @ApiProperty({ description: 'List of team members to create or update', type: [MemberDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MemberDto)
    members: MemberDto[];

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;
}

