import { IRoutingRule } from '../interfaces/routing-rule.interface';

export interface IRoutingRuleRepository {
    findByOrganization(organizationId: string): Promise<IRoutingRule[]>;

    /**
     * Resolve the routing rule for a specific (org, event, role) tuple.
     * Falls back through the wildcard chain:
     *   (org, event, role) → (org, event, '*') → (org, '*', role) → (org, '*', '*')
     * Returns null if no rule matches.
     */
    resolve(
        organizationId: string,
        event: string,
        role: string,
    ): Promise<IRoutingRule | null>;

    upsert(rule: Omit<IRoutingRule, 'uuid' | 'createdAt' | 'updatedAt'>): Promise<IRoutingRule>;

    upsertBatch(
        rules: Array<Omit<IRoutingRule, 'uuid' | 'createdAt' | 'updatedAt'>>,
    ): Promise<IRoutingRule[]>;

    deleteByOrganization(organizationId: string): Promise<number>;
}

export const ROUTING_RULE_REPOSITORY_TOKEN = Symbol.for(
    'RoutingRuleRepository',
);
