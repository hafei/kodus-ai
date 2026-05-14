import type { RateLimitResult } from '@libs/cli-review/infrastructure/services/trial-rate-limiter.service';

export const TRIAL_RATE_LIMITER_SERVICE_TOKEN = Symbol.for(
    'TRIAL_RATE_LIMITER_SERVICE_TOKEN',
);

export interface ITrialRateLimiterService {
    checkRateLimit(fingerprint: string): Promise<RateLimitResult>;
    getRateLimitStatus(fingerprint: string): Promise<RateLimitResult>;
}
