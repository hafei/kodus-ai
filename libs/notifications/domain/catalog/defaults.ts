import { Role } from '@libs/identity/domain/permissions/enums/permissions.enum';

import { Criticality, NotificationChannel } from '../enums';
import { NotificationEvent } from './events';

/**
 * Identifier of a lucide-react icon. Resolved to a component by the
 * frontend; kept here as a string so the catalog can ship over the wire
 * without React on the API side.
 */
export type CatalogIcon =
    | 'bell'
    | 'shield-alert'
    | 'zap'
    | 'info'
    | 'credit-card';

/**
 * Static metadata for each event in the catalog.
 * This is the source of truth for criticality, category, and the
 * default channels that are enabled when an org is first set up.
 */
export interface EventDefaults {
    readonly criticality: Criticality;
    readonly category: string;
    /** Human-readable label for the admin UI. */
    readonly label: string;
    /** Channels enabled by default when seeding routing rules. */
    readonly defaultChannels: ReadonlySet<NotificationChannel>;
    /**
     * Icon hint surfaced by the in-app drawer. Defaults to 'bell' when
     * absent so adding a new event without an icon still renders.
     */
    readonly icon?: CatalogIcon;
    /**
     * Page-severity flag for the most severe CRITICAL events. The
     * in-app shell renders a sticky non-dismissible banner for unread
     * notifications whose event has this set. Only meaningful when
     * `criticality === CRITICAL`.
     */
    readonly pageSeverity?: boolean;
    /**
     * Label rendered on the in-app banner / drawer CTA button when
     * `ctaUrl` is present. Defaults to 'View' on the frontend when not
     * declared — set explicitly for actionable critical events.
     */
    readonly actionLabel?: string;
}

export const EVENT_DEFAULTS: Readonly<
    Record<NotificationEvent, EventDefaults>
> = {
    [NotificationEvent.AUTH_EMAIL_CONFIRMATION]: {
        criticality: Criticality.SYSTEM,
        category: 'auth',
        label: 'Email Confirmation',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
        icon: 'shield-alert',
    },
    [NotificationEvent.AUTH_FORGOT_PASSWORD]: {
        criticality: Criticality.SYSTEM,
        category: 'auth',
        label: 'Forgot Password',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
        icon: 'shield-alert',
    },
    [NotificationEvent.TEAM_MEMBER_INVITED]: {
        criticality: Criticality.SYSTEM,
        category: 'team',
        label: 'Team Invite',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
        icon: 'zap',
    },
    [NotificationEvent.KODY_RULES_GENERATED]: {
        criticality: Criticality.INFORMATIONAL,
        category: 'kody_rules',
        label: 'Kody Rules Generated',
        defaultChannels: new Set([
            NotificationChannel.EMAIL,
            NotificationChannel.IN_APP,
        ]),
        icon: 'bell',
    },
    [NotificationEvent.SSO_DOMAIN_VERIFICATION]: {
        criticality: Criticality.SYSTEM,
        category: 'sso',
        label: 'SSO Domain Verification',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
        icon: 'shield-alert',
    },
    [NotificationEvent.WEEKLY_RECAP]: {
        criticality: Criticality.INFORMATIONAL,
        category: 'cockpit',
        label: 'Weekly Recap',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
        icon: 'info',
    },
};

/** All event categories, derived from the catalog. */
export const EVENT_CATEGORIES = [
    ...new Set(Object.values(EVENT_DEFAULTS).map((d) => d.category)),
] as const;

/**
 * Display labels for the four notification system axes that the
 * settings UI renders: channels, criticalities, categories, and roles.
 *
 * Centralized here so the frontend pulls them with the catalog response
 * — adding a new notification only ever requires backend changes.
 */
export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
    [NotificationChannel.EMAIL]: 'Email',
    [NotificationChannel.IN_APP]: 'In-App',
    [NotificationChannel.SLACK]: 'Slack',
    [NotificationChannel.DISCORD]: 'Discord',
    [NotificationChannel.WEBHOOK]: 'Webhook',
};

export const CRITICALITY_LABELS: Record<Criticality, string> = {
    [Criticality.SYSTEM]: 'System',
    [Criticality.CRITICAL]: 'Critical',
    [Criticality.TRANSACTIONAL]: 'Transactional',
    [Criticality.INFORMATIONAL]: 'Informational',
};

export const CATEGORY_LABELS: Record<string, string> = {
    auth: 'Auth',
    team: 'Team',
    kody_rules: 'Kody Rules',
    sso: 'SSO',
    cockpit: 'Cockpit',
    billing: 'Billing',
};

/**
 * Wildcard role used by the routing rules to express the "All Roles"
 * default config. Kept as a string here so the constant is shareable
 * with the catalog response — the Role enum has no wildcard member.
 */
export const ROLE_WILDCARD = '*';

export const ROLE_LABELS: Record<string, string> = {
    [ROLE_WILDCARD]: 'All Roles',
    [Role.OWNER]: 'Owner',
    [Role.BILLING_MANAGER]: 'Billing Manager',
    [Role.REPO_ADMIN]: 'Repo Admin',
    [Role.CONTRIBUTOR]: 'Contributor',
};
