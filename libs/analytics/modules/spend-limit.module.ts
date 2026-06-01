import { Module, forwardRef } from '@nestjs/common';

import { OrganizationParametersModule } from '@libs/organization/modules/organizationParameters.module';
import { NotificationEmitterModule } from '@libs/notifications/modules/notification-emitter.module';

import { ConfigureSpendLimitUseCase } from '../application/spend-limit/configure-spend-limit.use-case';
import { SpendLimitAlertService } from '../application/spend-limit/spend-limit-alert.service';
import { SpendLimitConfigService } from '../application/spend-limit/spend-limit-config.service';
import { AnalyticsModule } from './analytics.module';

/**
 * Composes the spend-limit feature: spend computation (AnalyticsModule),
 * org-parameter persistence (OrganizationParametersModule), and notification
 * emission (NotificationEmitterModule). The alert cron (Phase 4) and the
 * config endpoint (Phase 5) wire from here.
 */
@Module({
    imports: [
        AnalyticsModule,
        forwardRef(() => OrganizationParametersModule),
        NotificationEmitterModule,
    ],
    providers: [
        SpendLimitConfigService,
        ConfigureSpendLimitUseCase,
        SpendLimitAlertService,
    ],
    exports: [
        SpendLimitConfigService,
        ConfigureSpendLimitUseCase,
        SpendLimitAlertService,
    ],
})
export class SpendLimitModule {}
