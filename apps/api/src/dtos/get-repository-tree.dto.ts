import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { RepositoryTreeType } from '@libs/common/utils/enums/repositoryTree.enum';
import { ApiProperty } from '@nestjs/swagger';

export class GetRepositoryTreeDto {
    @ApiProperty({ description: 'organizationId', example: 'organizationId_example' })
    @IsString()
    organizationId: string;

    @ApiProperty({ description: 'teamId', example: 'teamId_example' })
    @IsString()
    teamId: string;

    @ApiProperty({ description: 'repositoryId', example: 'repositoryId_example' })
    @IsString()
    repositoryId: string;

    @ApiProperty({ description: 'treeType', example: 'treeType_example', required: false })
    @IsEnum(RepositoryTreeType)
    @IsOptional()
    treeType?: RepositoryTreeType;

    @ApiProperty({ description: 'useCache', example: true, required: false })
    @IsBoolean()
    @IsOptional()
    useCache?: boolean;
}
