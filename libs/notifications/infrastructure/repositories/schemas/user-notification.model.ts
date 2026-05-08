import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    Unique,
} from 'typeorm';

import { CoreModel } from '@libs/core/infrastructure/repositories/model/typeOrm';

import type { NotificationDeliveryModel } from './notification-delivery.model';

@Entity({ name: 'user_notifications', schema: 'kodus_notifications' })
@Index('IDX_un_user_read', ['userId', 'readAt'])
@Index('IDX_un_user_created', ['userId', 'createdAt'])
@Unique('UQ_un_delivery', ['deliveryId'])
export class UserNotificationModel extends CoreModel {
    @Column({ type: 'uuid' })
    userId: string;

    @Column({ type: 'uuid' })
    deliveryId: string;

    @ManyToOne('NotificationDeliveryModel', 'userNotifications', {
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'deliveryId', referencedColumnName: 'uuid' })
    delivery?: NotificationDeliveryModel;

    @Column({ type: 'timestamp', nullable: true })
    readAt?: Date | null;
}
