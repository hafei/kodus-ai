import { Column, Entity, Index, Unique } from 'typeorm';

import { CoreModel } from '@libs/core/infrastructure/repositories/model/typeOrm';

@Entity({ name: 'notification_routing_rules', schema: 'kodus_notifications' })
@Unique('UQ_nrr_org_event_role', ['organizationId', 'event', 'role'])
@Index('IDX_nrr_org', ['organizationId'])
export class RoutingRuleModel extends CoreModel {
    @Column({ type: 'uuid' })
    organizationId: string;

    @Column({ type: 'varchar', length: 100 })
    event: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    category?: string | null;

    @Column({ type: 'varchar', length: 30 })
    role: string;

    @Column({ type: 'jsonb', default: {} })
    channels: Record<string, boolean>;
}
