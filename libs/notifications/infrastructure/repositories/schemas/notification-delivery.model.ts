import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';

import { CoreModel } from '@libs/core/infrastructure/repositories/model/typeOrm';
import { OrganizationModel } from '@libs/organization/infrastructure/adapters/repositories/schemas/organization.model';
import { UserModel } from '@libs/identity/infrastructure/adapters/repositories/schemas/user.model';

import { Criticality } from '../../../domain/enums/criticality.enum';
import { DeliveryStatus } from '../../../domain/enums/delivery-status.enum';
import { NotificationChannel } from '../../../domain/enums/channel.enum';
import type { UserNotificationModel } from './user-notification.model';

@Entity({ name: 'notification_deliveries' })
@Index('IDX_nd_org_event', ['organization', 'event'])
@Index('IDX_nd_channel_status', ['channel', 'deliveryStatus'])
@Index('IDX_nd_correlation', ['correlationId'])
@Index('IDX_nd_created', ['createdAt'])
export class NotificationDeliveryModel extends CoreModel {
    @ManyToOne(() => OrganizationModel, { nullable: false })
    @JoinColumn({ name: 'organization_id', referencedColumnName: 'uuid' })
    organization: OrganizationModel;

    @ManyToOne(() => UserModel, { nullable: true })
    @JoinColumn({ name: 'recipient_user_id', referencedColumnName: 'uuid' })
    recipientUser?: UserModel;

    @Column({ type: 'text' })
    event: string;

    @Column({ type: 'enum', enum: Criticality })
    criticality: Criticality;

    @Column({ type: 'enum', enum: NotificationChannel })
    channel: NotificationChannel;

    @Column({ type: 'text' })
    title: string;

    @Column({ type: 'text' })
    body: string;

    @Column({ type: 'text', nullable: true })
    ctaUrl?: string;

    @Column({ type: 'text' })
    category: string;

    @Column({ type: 'text', nullable: true })
    recipientEmail?: string;

    @Column({
        type: 'enum',
        enum: DeliveryStatus,
        default: DeliveryStatus.PENDING,
    })
    deliveryStatus: DeliveryStatus;

    @Column({ type: 'jsonb', default: {} })
    metadata: Record<string, unknown>;

    @Column({ type: 'text' })
    correlationId: string;

    @Column({ type: 'text', nullable: true })
    lastError?: string;

    @Column({ type: 'timestamp', nullable: true })
    deliveredAt?: Date;

    @OneToMany('UserNotificationModel', 'delivery')
    userNotifications?: UserNotificationModel[];
}
