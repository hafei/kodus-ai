import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { RepositoryTreeType } from '@libs/common/utils/enums/repositoryTree.enum';
import { ApiProperty } from '@nestjs/swagger';

export class GetRepositoryTreeDto {
    @ApiProperty({ description: 'Organization unique identifier', example: 'org_456def' })
    @IsString()
    organizationId: string;

    @ApiProperty({ description: 'Team unique identifier', example: 'team_123abc' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'Repository unique identifier', example: 'repo_789ghi' })
    @IsString()
    repositoryId: string;

    @ApiProperty({ description: 'Type of tree to fetch (e.g., FILES, COMMITS)', example: 'FILES', required: false })
    @IsEnum(RepositoryTreeType)
    @IsOptional()
    treeType?: RepositoryTreeType;

    @ApiProperty({ description: 'Whether to use cached tree data', example: true, required: false })
    @IsBoolean()
    @IsOptional()
    useCache?: boolean;
}
