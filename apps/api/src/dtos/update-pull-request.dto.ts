import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class updatePullRequestDto {
    @ApiProperty({
        description: 'Associated team id',
        @ApiProperty({ description: 'example', example: 'example_example' })
        example: 'team_123',
        @ApiProperty({ description: 'required', example: 'required_example' })
        required: false,
    })
    @ApiProperty({ description: 'teamId', example: 'teamId_example', required: false })
    @IsString()
    @IsOptional()
    public teamId?: string;

    @ApiProperty({ description: 'organizationId', example: 'organizationId_example' })
    @IsString()
    public organizationId: string;
}
