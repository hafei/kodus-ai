import { Criticality, NotificationChannel } from '../enums';
import { NotificationEvent } from './events';

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
}

export const EVENT_DEFAULTS: Readonly<
    Record<NotificationEvent, EventDefaults>
> = {
    [NotificationEvent.AUTH_EMAIL_CONFIRMATION]: {
        criticality: Criticality.SYSTEM,
        category: 'auth',
        label: 'Email Confirmation',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
    },
    [NotificationEvent.AUTH_FORGOT_PASSWORD]: {
        criticality: Criticality.SYSTEM,
        category: 'auth',
        label: 'Forgot Password',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
    },
    [NotificationEvent.TEAM_MEMBER_INVITED]: {
        criticality: Criticality.SYSTEM,
        category: 'team',
        label: 'Team Invite',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
    },
    [NotificationEvent.KODY_RULES_GENERATED]: {
        criticality: Criticality.INFORMATIONAL,
        category: 'kody_rules',
        label: 'Kody Rules Generated',
        defaultChannels: new Set([
            NotificationChannel.EMAIL,
            NotificationChannel.IN_APP,
        ]),
    },
    [NotificationEvent.SSO_DOMAIN_VERIFICATION]: {
        criticality: Criticality.SYSTEM,
        category: 'sso',
        label: 'SSO Domain Verification',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
    },
    [NotificationEvent.WEEKLY_RECAP]: {
        criticality: Criticality.INFORMATIONAL,
        category: 'cockpit',
        label: 'Weekly Recap',
        defaultChannels: new Set([NotificationChannel.EMAIL]),
    },
};

/** All event categories, derived from the catalog. */
export const EVENT_CATEGORIES = [
    ...new Set(Object.values(EVENT_DEFAULTS).map((d) => d.category)),
] as const;
