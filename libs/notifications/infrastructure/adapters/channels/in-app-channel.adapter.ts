import { createLogger } from '@kodus/flow';
import { Inject, Injectable } from '@nestjs/common';

import {
    IChannelAdapter,
    NotificationDeliveryContext,
} from '../../../domain/contracts/channel-adapter.contract';
import {
    IUserNotificationRepository,
    USER_NOTIFICATION_REPOSITORY_TOKEN,
} from '../../../domain/contracts/user-notification.repository.contract';
import { NotificationChannel } from '../../../domain/enums/channel.enum';

/**
 * In-app channel: inserts a `user_notification` row so it shows up in
 * the notification center bell / drawer.
 */
@Injectable()
export class InAppChannelAdapter implements IChannelAdapter {
    readonly channel = NotificationChannel.IN_APP;
    private readonly logger = createLogger(InAppChannelAdapter.name);

    constructor(
        @Inject(USER_NOTIFICATION_REPOSITORY_TOKEN)
        private readonly userNotificationRepo: IUserNotificationRepository,
    ) {}

    async deliver(context: NotificationDeliveryContext): Promise<void> {
        await this.userNotificationRepo.create({
            userId: context.userId,
            deliveryId: context.deliveryId,
            readAt: null,
        });

        this.logger.log({
            message: 'In-app notification created',
            context: InAppChannelAdapter.name,
            metadata: {
                userId: context.userId,
                deliveryId: context.deliveryId,
                event: context.event,
            },
        });
    }
}
