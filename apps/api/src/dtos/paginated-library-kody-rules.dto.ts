import { LibraryKodyRule } from '@libs/core/infrastructure/config/types/general/kodyRules.type';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetadata {
    @ApiProperty({ description: 'currentPage', example: 123 })
    currentPage: number;
    @ApiProperty({ description: 'totalPages', example: 123 })
    totalPages: number;
    @ApiProperty({ description: 'totalItems', example: 123 })
    totalItems: number;
    @ApiProperty({ description: 'itemsPerPage', example: 123 })
    itemsPerPage: number;
    @ApiProperty({ description: 'hasNextPage', example: true })
    hasNextPage: boolean;
    @ApiProperty({ description: 'hasPreviousPage', example: true })
    hasPreviousPage: boolean;
}

export class PaginatedLibraryKodyRulesResponse {
    @ApiProperty({ description: 'data', example: ["example"] })
    data: LibraryKodyRule[];
    @ApiProperty({ description: 'pagination', example: 'pagination_example' })
    pagination: PaginationMetadata;
}
