import { Criticality, DeliveryStatus, NotificationChannel } from '../enums';

export interface INotificationDelivery {
    uuid?: string;
    organizationId: string;
    event: string;
    criticality: Criticality;
    channel: NotificationChannel;
    title: string;
    body: string;
    ctaUrl?: string;
    category: string;
    recipientEmail?: string;
    recipientUserId?: string;
    deliveryStatus: DeliveryStatus;
    metadata: Record<string, unknown>;
    correlationId: string;
    lastError?: string;
    deliveredAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}
