import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { NotificationEvent } from '../domain/catalog/events';
import { EVENT_DEFAULTS } from '../domain/catalog/defaults';
import {
    Criticality,
    ACTIVE_CHANNELS,
    NotificationChannel,
} from '../domain/enums';
import {
    IRoutingRuleRepository,
    ROUTING_RULE_REPOSITORY_TOKEN,
} from '../domain/contracts/routing-rule.repository.contract';
import { IRoutingRule } from '../domain/interfaces/routing-rule.interface';

export interface UpsertRuleDto {
    event: string;
    role: string;
    channels: Record<string, boolean>;
}

/**
 * CRUD for owner-managed routing rules + critical event enforcement.
 */
@Injectable()
export class RoutingRuleService {
    constructor(
        @Inject(ROUTING_RULE_REPOSITORY_TOKEN)
        private readonly routingRuleRepo: IRoutingRuleRepository,
    ) {}

    async findByOrganization(organizationId: string): Promise<IRoutingRule[]> {
        return this.routingRuleRepo.findByOrganization(organizationId);
    }

    async upsertRules(
        organizationId: string,
        rules: UpsertRuleDto[],
    ): Promise<IRoutingRule[]> {
        // Enforce critical events: cannot disable any channel
        for (const rule of rules) {
            const eventDefaults =
                EVENT_DEFAULTS[rule.event as NotificationEvent];
            if (
                eventDefaults &&
                eventDefaults.criticality === Criticality.CRITICAL
            ) {
                const disabledChannels = Object.entries(rule.channels)
                    .filter(
                        ([ch, enabled]) =>
                            !enabled &&
                            ACTIVE_CHANNELS.has(ch as NotificationChannel),
                    )
                    .map(([ch]) => ch);

                if (disabledChannels.length > 0) {
                    throw new BadRequestException(
                        `Cannot disable channels [${disabledChannels.join(', ')}] for critical event "${rule.event}". Critical notifications must be delivered on all active channels.`,
                    );
                }
            }
        }

        return this.routingRuleRepo.upsertBatch(
            rules.map((r) => ({
                organization: { uuid: organizationId },
                event: r.event,
                role: r.role,
                category:
                    EVENT_DEFAULTS[r.event as NotificationEvent]?.category ??
                    null,
                channels: r.channels,
            })),
        );
    }

    /**
     * Seed default routing rules for a new organization.
     * Called once when the org is created.
     */
    async seedDefaults(organizationId: string): Promise<IRoutingRule[]> {
        const rules: Array<
            Omit<IRoutingRule, 'uuid' | 'createdAt' | 'updatedAt'>
        > = [];

        for (const [event, defaults] of Object.entries(EVENT_DEFAULTS)) {
            const channels: Record<string, boolean> = {};
            for (const ch of ACTIVE_CHANNELS) {
                channels[ch] = defaults.defaultChannels.has(ch);
            }

            // Seed for wildcard role — applies to all roles by default
            rules.push({
                organization: { uuid: organizationId },
                event,
                category: defaults.category,
                role: '*',
                channels,
            });
        }

        return this.routingRuleRepo.upsertBatch(rules);
    }

    async resetToDefaults(organizationId: string): Promise<IRoutingRule[]> {
        await this.routingRuleRepo.deleteByOrganization(organizationId);
        return this.seedDefaults(organizationId);
    }
}
