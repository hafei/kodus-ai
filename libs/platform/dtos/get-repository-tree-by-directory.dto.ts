import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetRepositoryTreeByDirectoryDto {
    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi' })
    @IsString()
    repositoryId: string;

    @ApiProperty({
        description: 'Directory path to load (root if not provided)',
        example: 'src/services',
        required: false,
    })
    @IsOptional()
    @IsString()
    directoryPath?: string;

    @ApiProperty({
        description: 'Whether to use cached data or fetch fresh data',
        example: true,
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    })
    useCache?: boolean = true;
}
