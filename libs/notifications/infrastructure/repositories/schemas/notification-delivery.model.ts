import { Column, Entity, Index, OneToMany } from 'typeorm';

import { CoreModel } from '@libs/core/infrastructure/repositories/model/typeOrm';

import { Criticality } from '../../../domain/enums/criticality.enum';
import { DeliveryStatus } from '../../../domain/enums/delivery-status.enum';
import { NotificationChannel } from '../../../domain/enums/channel.enum';
import type { UserNotificationModel } from './user-notification.model';

@Entity({ name: 'notification_deliveries', schema: 'kodus_notifications' })
@Index('IDX_nd_org_event', ['organizationId', 'event'])
@Index('IDX_nd_channel_status', ['channel', 'deliveryStatus'])
@Index('IDX_nd_correlation', ['correlationId'])
@Index('IDX_nd_created', ['createdAt'])
export class NotificationDeliveryModel extends CoreModel {
    @Column({ type: 'uuid' })
    organizationId: string;

    @Column({ type: 'varchar', length: 100 })
    event: string;

    @Column({ type: 'enum', enum: Criticality })
    criticality: Criticality;

    @Column({ type: 'enum', enum: NotificationChannel })
    channel: NotificationChannel;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text' })
    body: string;

    @Column({ type: 'varchar', length: 512, nullable: true })
    ctaUrl?: string;

    @Column({ type: 'varchar', length: 50 })
    category: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    recipientEmail?: string;

    @Column({ type: 'uuid', nullable: true })
    recipientUserId?: string;

    @Column({
        type: 'enum',
        enum: DeliveryStatus,
        default: DeliveryStatus.PENDING,
    })
    deliveryStatus: DeliveryStatus;

    @Column({ type: 'jsonb', default: {} })
    metadata: Record<string, unknown>;

    @Column({ type: 'varchar', length: 100 })
    correlationId: string;

    @Column({ type: 'text', nullable: true })
    lastError?: string;

    @Column({ type: 'timestamp', nullable: true })
    deliveredAt?: Date;

    @OneToMany('UserNotificationModel', 'delivery')
    userNotifications?: UserNotificationModel[];
}
