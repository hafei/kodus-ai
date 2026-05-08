/**
 * Typed notification event catalog.
 *
 * Adding a new event:
 * 1. Add the enum member below.
 * 2. Add its payload type to `NotificationPayloadMap`.
 * 3. Add its defaults to `defaults.ts`.
 * Done — compile errors guide you if the payload is wrong at the call-site.
 */
export enum NotificationEvent {
    // ── Auth ────────────────────────────────────────────────────
    AUTH_EMAIL_CONFIRMATION = 'auth.email_confirmation',
    AUTH_FORGOT_PASSWORD = 'auth.forgot_password',

    // ── Organization / Team ────────────────────────────────────
    TEAM_MEMBER_INVITED = 'team.member_invited',

    // ── Kody Rules ─────────────────────────────────────────────
    KODY_RULES_GENERATED = 'kody_rules.generated',

    // ── SSO ────────────────────────────────────────────────────
    SSO_DOMAIN_VERIFICATION = 'sso.domain_verification',

    // ── Cockpit ────────────────────────────────────────────────
    WEEKLY_RECAP = 'cockpit.weekly_recap',

    // ── Billing (future — critical) ────────────────────────────
    // BILLING_PAYMENT_FAILED = 'billing.payment_failed',

    // ── Security (future — critical) ───────────────────────────
    // SECURITY_API_KEY_LEAKED = 'security.api_key_leaked',
}

// ────────────────────────────────────────────────────────────────
// Payload map — one entry per event.
// The emitter generic `emit<E>()` infers the payload type at
// compile time, so a wrong payload is a build error.
// ────────────────────────────────────────────────────────────────

export interface NotificationPayloadMap {
    [NotificationEvent.AUTH_EMAIL_CONFIRMATION]: {
        token: string;
        email: string;
        organizationName: string;
        organizationAndTeamData?: {
            organizationId?: string;
            teamId?: string;
        };
    };

    [NotificationEvent.AUTH_FORGOT_PASSWORD]: {
        email: string;
        name: string;
        token: string;
    };

    [NotificationEvent.TEAM_MEMBER_INVITED]: {
        /** Full user object (with teamMember, organization relations). */
        user: any;
        inviterEmail: string;
        inviteLink: string;
    };

    [NotificationEvent.KODY_RULES_GENERATED]: {
        /** All active users in the org receive the notification. */
        users: Array<{ email: string; name: string }>;
        rules: string[];
        organizationName: string;
    };

    [NotificationEvent.SSO_DOMAIN_VERIFICATION]: {
        token: string;
        email: string;
        organizationName: string;
        domain: string;
    };

    [NotificationEvent.WEEKLY_RECAP]: {
        recipient: { email: string; name: string };
        props: Record<string, unknown>;
    };
}
