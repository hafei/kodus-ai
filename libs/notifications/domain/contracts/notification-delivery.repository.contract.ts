import { INotificationDelivery } from '../interfaces/notification-delivery.interface';

export interface INotificationDeliveryRepository {
    create(
        delivery: Omit<INotificationDelivery, 'uuid' | 'createdAt' | 'updatedAt'>,
    ): Promise<INotificationDelivery>;

    updateStatus(
        deliveryId: string,
        status: INotificationDelivery['deliveryStatus'],
        error?: string,
    ): Promise<void>;

    findByCorrelationId(correlationId: string): Promise<INotificationDelivery[]>;
}

export const NOTIFICATION_DELIVERY_REPOSITORY_TOKEN = Symbol.for(
    'NotificationDeliveryRepository',
);
