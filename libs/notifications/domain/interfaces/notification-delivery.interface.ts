import { IOrganization } from '@libs/organization/domain/organization/interfaces/organization.interface';
import { IUser } from '@libs/identity/domain/user/interfaces/user.interface';
import { Criticality, DeliveryStatus, NotificationChannel } from '../enums';

export interface INotificationDelivery {
    uuid?: string;
    organization?: Partial<IOrganization>;
    recipientUser?: Partial<IUser>;
    event: string;
    criticality: Criticality;
    channel: NotificationChannel;
    title: string;
    body: string;
    ctaUrl?: string;
    category: string;
    recipientEmail?: string;
    deliveryStatus: DeliveryStatus;
    metadata: Record<string, unknown>;
    correlationId: string;
    lastError?: string;
    deliveredAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}
