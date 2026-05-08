export interface NotificationDelivery {
    uuid: string;
    event: string;
    criticality: 'critical' | 'transactional' | 'informational';
    title: string;
    body: string;
    ctaUrl?: string;
    category: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface UserNotification {
    uuid: string;
    userId: string;
    deliveryId: string;
    readAt: string | null;
    createdAt: string;
    delivery: NotificationDelivery;
}

export interface NotificationListResponse {
    data: UserNotification[];
    total: number;
    page: number;
    limit: number;
}

export interface UnreadCountResponse {
    count: number;
}

export interface RoutingRule {
    uuid: string;
    organizationId: string;
    event: string;
    category?: string | null;
    role: string;
    channels: Record<string, boolean>;
    createdAt: string;
    updatedAt: string;
}

export interface UpsertRoutingRulePayload {
    event: string;
    role: string;
    channels: Record<string, boolean>;
    /** When true, removes this (event, role) row so it inherits from '*'. */
    delete?: boolean;
}

export type EventCriticality =
    | "system"
    | "critical"
    | "transactional"
    | "informational";

export interface EventCatalogEntry {
    event: string;
    label: string;
    category: string;
    criticality: EventCriticality;
    /** Channels delivered to when no routing rule exists for the event. */
    defaultChannels: Record<string, boolean>;
}
