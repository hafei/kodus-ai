import { EnrichedPullRequestResponse } from './enriched-pull-request-response.dto';
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

export class PaginatedEnrichedPullRequestsResponse {
    @ApiProperty({ description: 'Array of enriched pull requests', example: [{ prNumber: 123, title: 'Add feature' }] })
    data: EnrichedPullRequestResponse[];
    @ApiProperty({ description: 'Pagination metadata', example: { currentPage: 1, totalPages: 10 } })
    pagination: PaginationMetadata;
}
