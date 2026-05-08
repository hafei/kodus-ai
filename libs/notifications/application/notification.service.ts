import { createLogger } from '@kodus/flow';
import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';

import {
    IMessageBrokerService,
    MESSAGE_BROKER_SERVICE_TOKEN,
} from '@libs/core/domain/contracts/message-broker.service.contracts';
import {
    IOutboxMessageRepository,
    OUTBOX_MESSAGE_REPOSITORY_TOKEN,
} from '@libs/core/workflow/domain/contracts/outbox-message.repository.contract';

import {
    NotificationEvent,
    NotificationPayloadMap,
} from '../domain/catalog/events';

/**
 * The one-liner entry point for emitting notifications.
 *
 * ```ts
 * await this.notificationService.emit(NotificationEvent.AUTH_FORGOT_PASSWORD, {
 *   email: user.email, name: org.name, token,
 * }, { organizationId: org.uuid, userId: user.uuid });
 * ```
 *
 * Creates an outbox message which the OutboxRelayService picks up and
 * publishes to RabbitMQ. The worker's NotificationConsumer then handles
 * routing, preference resolution, and multi-channel delivery.
 */
@Injectable()
export class NotificationService {
    private readonly logger = createLogger(NotificationService.name);

    constructor(
        @Inject(MESSAGE_BROKER_SERVICE_TOKEN)
        private readonly messageBroker: IMessageBrokerService,
        @Inject(OUTBOX_MESSAGE_REPOSITORY_TOKEN)
        private readonly outboxRepository: IOutboxMessageRepository,
    ) {}

    async emit<E extends NotificationEvent>(
        event: E,
        payload: NotificationPayloadMap[E],
        context: {
            organizationId: string;
            userId?: string;
            correlationId?: string;
        },
    ): Promise<void> {
        const correlationId = context.correlationId ?? uuid();
        const exchange = 'notification.exchange';
        const routingKey = `notification.${event}`;

        const messagePayload =
            this.messageBroker.transformMessageToMessageBroker({
                eventName: event,
                message: {
                    event,
                    payload,
                    organizationId: context.organizationId,
                    userId: context.userId,
                    correlationId,
                },
            });

        await this.outboxRepository.create({
            jobId: correlationId,
            exchange,
            routingKey,
            payload: messagePayload as unknown as Record<string, unknown>,
        });

        this.logger.log({
            message: `Notification emitted: ${event}`,
            context: NotificationService.name,
            metadata: {
                event,
                organizationId: context.organizationId,
                userId: context.userId,
                correlationId,
            },
        });
    }
}
