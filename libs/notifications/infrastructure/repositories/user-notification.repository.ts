import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import {
    IUserNotificationRepository,
    UserNotificationWithDelivery,
} from '../../domain/contracts/user-notification.repository.contract';
import { IUserNotification } from '../../domain/interfaces/user-notification.interface';
import { UserNotificationModel } from './schemas/user-notification.model';

@Injectable()
export class UserNotificationRepository
    implements IUserNotificationRepository
{
    constructor(
        @InjectRepository(UserNotificationModel)
        private readonly repo: Repository<UserNotificationModel>,
    ) {}

    async create(
        notification: Omit<IUserNotification, 'uuid'>,
    ): Promise<IUserNotification> {
        const entity = this.repo.create(notification);
        return this.repo.save(entity);
    }

    async findByUser(
        userId: string,
        options: { limit: number; offset: number; unreadOnly?: boolean },
    ): Promise<{ data: UserNotificationWithDelivery[]; total: number }> {
        const where: Record<string, unknown> = { userId };
        if (options.unreadOnly) {
            where.readAt = IsNull();
        }

        const [rows, total] = await this.repo.findAndCount({
            where,
            relations: ['delivery'],
            order: { createdAt: 'DESC' },
            take: options.limit,
            skip: options.offset,
        });

        const data: UserNotificationWithDelivery[] = rows.map((row) => ({
            uuid: row.uuid,
            userId: row.userId,
            deliveryId: row.deliveryId,
            readAt: row.readAt,
            createdAt: row.createdAt,
            delivery: {
                uuid: row.delivery!.uuid,
                event: row.delivery!.event,
                criticality: row.delivery!.criticality,
                title: row.delivery!.title,
                body: row.delivery!.body,
                ctaUrl: row.delivery!.ctaUrl,
                category: row.delivery!.category,
                metadata: row.delivery!.metadata,
                createdAt: row.delivery!.createdAt,
            },
        }));

        return { data, total };
    }

    async countUnread(userId: string): Promise<number> {
        return this.repo.count({
            where: { userId, readAt: IsNull() },
        });
    }

    async markAsRead(notificationId: string, userId: string): Promise<void> {
        await this.repo.update(
            { uuid: notificationId, userId },
            { readAt: new Date() },
        );
    }

    async markAllAsRead(userId: string): Promise<number> {
        const result = await this.repo.update(
            { userId, readAt: IsNull() },
            { readAt: new Date() },
        );
        return result.affected ?? 0;
    }
}
