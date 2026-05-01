import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { environment } from '@libs/ee/configs/environment';
import { SelfHostedBeaconService } from '@libs/telemetry/application/services/self-hosted-beacon.service';

/**
 * Daily anonymous heartbeat for self-hosted instances. Sends one POST per
 * UTC day to the `kodus-beacon` receiver (telemetry.kodus.io); the service
 * itself owns dedupe, opt-out, and `instance_id` persistence.
 *
 * Schedule: 03:17 UTC daily — the odd minute is intentional jitter so the
 * global fleet doesn't stampede the receiver at the top of the hour.
 *
 * Scope: self-hosted only. Cloud already has rich product telemetry via
 * PostHog/Resend/n8n; the cloud control plane has no use for its own
 * heartbeat. Skip on cloud entirely.
 */
@Injectable()
export class SelfHostedBeaconCron {
    private readonly logger = new Logger(SelfHostedBeaconCron.name);

    constructor(private readonly beacon: SelfHostedBeaconService) {}

    @Cron('17 3 * * *', {
        name: 'self-hosted-beacon',
        timeZone: 'UTC',
    })
    async handle(): Promise<void> {
        if (environment.API_CLOUD_MODE) {
            return;
        }

        const start = Date.now();
        await this.beacon.run();
        this.logger.log(
            `self-hosted beacon done in ${Date.now() - start}ms`,
        );
    }
}
