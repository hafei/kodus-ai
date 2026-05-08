import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
    IRoutingRuleRepository,
} from '../../domain/contracts/routing-rule.repository.contract';
import { IRoutingRule } from '../../domain/interfaces/routing-rule.interface';
import { RoutingRuleModel } from './schemas/routing-rule.model';

@Injectable()
export class RoutingRuleRepository implements IRoutingRuleRepository {
    constructor(
        @InjectRepository(RoutingRuleModel)
        private readonly repo: Repository<RoutingRuleModel>,
    ) {}

    async findByOrganization(organizationId: string): Promise<IRoutingRule[]> {
        return this.repo.find({
            where: { organizationId },
            order: { event: 'ASC', role: 'ASC' },
        });
    }

    /**
     * Resolve routing for (org, event, role) with wildcard fallback:
     *   1. (org, event, role)
     *   2. (org, event, '*')
     *   3. (org, '*',   role)
     *   4. (org, '*',   '*')
     */
    async resolve(
        organizationId: string,
        event: string,
        role: string,
    ): Promise<IRoutingRule | null> {
        const candidates = await this.repo.find({
            where: [
                { organizationId, event, role },
                { organizationId, event, role: '*' },
                { organizationId, event: '*', role },
                { organizationId, event: '*', role: '*' },
            ],
        });

        if (candidates.length === 0) return null;

        // Pick best match by specificity
        const prioritized = candidates.sort((a, b) => {
            const specificity = (r: IRoutingRule) =>
                (r.event === '*' ? 0 : 2) + (r.role === '*' ? 0 : 1);
            return specificity(b) - specificity(a);
        });

        return prioritized[0];
    }

    async upsert(
        rule: Omit<IRoutingRule, 'uuid' | 'createdAt' | 'updatedAt'>,
    ): Promise<IRoutingRule> {
        const existing = await this.repo.findOne({
            where: {
                organizationId: rule.organizationId,
                event: rule.event,
                role: rule.role,
            },
        });

        if (existing) {
            existing.channels = rule.channels;
            existing.category = rule.category;
            return this.repo.save(existing);
        }

        const entity = this.repo.create(rule);
        return this.repo.save(entity);
    }

    async upsertBatch(
        rules: Array<Omit<IRoutingRule, 'uuid' | 'createdAt' | 'updatedAt'>>,
    ): Promise<IRoutingRule[]> {
        const results: IRoutingRule[] = [];
        for (const rule of rules) {
            results.push(await this.upsert(rule));
        }
        return results;
    }

    async deleteByOrganization(organizationId: string): Promise<number> {
        const result = await this.repo.delete({ organizationId });
        return result.affected ?? 0;
    }
}
