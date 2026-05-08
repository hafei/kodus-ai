import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
    INotificationDeliveryRepository,
} from '../../domain/contracts/notification-delivery.repository.contract';
import { INotificationDelivery } from '../../domain/interfaces/notification-delivery.interface';
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
        const entity = this.repo.create(delivery);
        return this.repo.save(entity);
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
        return this.repo.find({
            where: { correlationId },
            order: { createdAt: 'DESC' },
        });
    }
}
