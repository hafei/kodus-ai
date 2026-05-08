import { Inject, Injectable } from '@nestjs/common';

import {
    IUserNotificationRepository,
    USER_NOTIFICATION_REPOSITORY_TOKEN,
    UserNotificationWithDelivery,
} from '../domain/contracts/user-notification.repository.contract';

/**
 * Read-side service for the notification center UI.
 */
@Injectable()
export class NotificationQueryService {
    constructor(
        @Inject(USER_NOTIFICATION_REPOSITORY_TOKEN)
        private readonly userNotificationRepo: IUserNotificationRepository,
    ) {}

    async list(
        userId: string,
        options: { page: number; limit: number; unreadOnly?: boolean },
    ): Promise<{
        data: UserNotificationWithDelivery[];
        total: number;
        page: number;
        limit: number;
    }> {
        const offset = (options.page - 1) * options.limit;
        const result = await this.userNotificationRepo.findByUser(userId, {
            limit: options.limit,
            offset,
            unreadOnly: options.unreadOnly,
        });

        return {
            ...result,
            page: options.page,
            limit: options.limit,
        };
    }

    async unreadCount(userId: string): Promise<number> {
        return this.userNotificationRepo.countUnread(userId);
    }

    async markAsRead(notificationId: string, userId: string): Promise<void> {
        return this.userNotificationRepo.markAsRead(notificationId, userId);
    }

    async markAllAsRead(userId: string): Promise<number> {
        return this.userNotificationRepo.markAllAsRead(userId);
    }
}
