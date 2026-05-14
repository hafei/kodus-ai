import type { AuthenticatedRateLimitResult } from '@libs/cli-review/infrastructure/services/authenticated-rate-limiter.service';

export const AUTHENTICATED_RATE_LIMITER_SERVICE_TOKEN = Symbol.for(
    'AUTHENTICATED_RATE_LIMITER_SERVICE_TOKEN',
);

export interface IAuthenticatedRateLimiterService {
    checkRateLimit(teamId: string): Promise<AuthenticatedRateLimitResult>;
}
