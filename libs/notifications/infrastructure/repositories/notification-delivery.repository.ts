import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { mapSimpleModelToEntity } from '@libs/core/infrastructure/repositories/mappers';

import {
    INotificationDeliveryRepository,
} from '../../domain/contracts/notification-delivery.repository.contract';
import { INotificationDelivery } from '../../domain/interfaces/notification-delivery.interface';
import { NotificationDeliveryEntity } from '../../domain/entities/notification-delivery.entity';
import { DeliveryStatus } from '../../domain/enums/delivery-status.enum';
import { NotificationDeliveryModel } from './schemas/notification-delivery.model';

@Injectable()
export class NotificationDeliveryRepository
    implements INotificationDeliveryRepository
{
    constructor(
        @InjectRepository(NotificationDeliveryModel)
        private readonly repo: Repository<NotificationDeliveryModel>,
    ) {}

    async create(
        delivery: Omit<INotificationDelivery, 'uuid' | 'createdAt' | 'updatedAt'>,
    ): Promise<INotificationDelivery> {
        const entity = this.repo.create({
            organization: delivery.organization
                ? { uuid: delivery.organization.uuid }
                : undefined,
            recipientUser: delivery.recipientUser
                ? { uuid: delivery.recipientUser.uuid }
                : undefined,
            event: delivery.event,
            criticality: delivery.criticality,
            channel: delivery.channel,
            title: delivery.title,
            body: delivery.body,
            ctaUrl: delivery.ctaUrl,
            category: delivery.category,
            recipientEmail: delivery.recipientEmail,
            deliveryStatus: delivery.deliveryStatus,
            metadata: delivery.metadata,
            correlationId: delivery.correlationId,
        });
        const saved = await this.repo.save(entity);
        return mapSimpleModelToEntity<
            NotificationDeliveryModel,
            NotificationDeliveryEntity
        >(saved, NotificationDeliveryEntity).toObject();
    }

    async updateStatus(
        deliveryId: string,
        status: DeliveryStatus,
        error?: string,
    ): Promise<void> {
        const update: Partial<NotificationDeliveryModel> = {
            deliveryStatus: status,
        };
        if (error !== undefined) {
            update.lastError = error;
        }
        if (status === DeliveryStatus.DELIVERED) {
            update.deliveredAt = new Date();
        }
        await this.repo.update({ uuid: deliveryId }, update);
    }

    async findByCorrelationId(
        correlationId: string,
    ): Promise<INotificationDelivery[]> {
        const rows = await this.repo.find({
            where: { correlationId },
            order: { createdAt: 'DESC' },
        });
        return rows.map(
            (r) =>
                mapSimpleModelToEntity<
                    NotificationDeliveryModel,
                    NotificationDeliveryEntity
                >(r, NotificationDeliveryEntity).toObject(),
        );
    }
}
