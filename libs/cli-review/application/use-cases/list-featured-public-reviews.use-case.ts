import { Injectable } from '@nestjs/common';
import {
    FeaturedPublicReviewListItem,
    FeaturedPublicReviewRepository,
} from '@libs/cli-review/infrastructure/repositories/featured-public-review.repository';

/**
 * Reads the curated home-grid list. Pulled out of the controller so
 * the HTTP layer stays a thin transport adapter and we can reuse the
 * same fetch from scripts/tests without spinning up Nest's HTTP stack.
 */
@Injectable()
export class ListFeaturedPublicReviewsUseCase {
    constructor(
        private readonly featuredPublicReviewRepository: FeaturedPublicReviewRepository,
    ) {}

    async execute(): Promise<{ items: FeaturedPublicReviewListItem[] }> {
        const items =
            await this.featuredPublicReviewRepository.listPublished();
        return { items };
    }
}
