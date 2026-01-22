import { LibraryKodyRule } from '@libs/core/infrastructure/config/types/general/kodyRules.type';
import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetadata {
    @ApiProperty({ description: 'Current page number', example: 1 })
    currentPage: number;
    @ApiProperty({ description: 'Total number of pages', example: 10 })
    totalPages: number;
    @ApiProperty({ description: 'Total number of items', example: 100 })
    totalItems: number;
    @ApiProperty({ description: 'Number of items per page', example: 10 })
    itemsPerPage: number;
    @ApiProperty({ description: 'Whether next page exists', example: true })
    hasNextPage: boolean;
    @ApiProperty({ description: 'Whether previous page exists', example: false })
    hasPreviousPage: boolean;
}

export class PaginatedLibraryKodyRulesResponse {
    @ApiProperty({ description: 'Array of library Kody rules', example: [{ title: 'No console log' }] })
    data: LibraryKodyRule[];
    @ApiProperty({ description: 'Pagination metadata', example: { currentPage: 1, totalPages: 10 } })
    pagination: PaginationMetadata;
}
