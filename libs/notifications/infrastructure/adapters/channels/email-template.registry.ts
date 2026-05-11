import * as React from 'react';

import { EmailFrom } from '@libs/common/email/from';
import ConfirmationEmail, {
    confirmationEmailMeta,
} from '@libs/common/email/templates/confirmation';
import DomainVerificationEmail, {
    domainVerificationEmailMeta,
} from '@libs/common/email/templates/domain-verification';
import ForgotPasswordEmail, {
    forgotPasswordEmailMeta,
} from '@libs/common/email/templates/forgot-password';
import InviteEmail, {
    inviteEmailMeta,
} from '@libs/common/email/templates/invite';
import KodyRulesEmail, {
    kodyRulesEmailMeta,
} from '@libs/common/email/templates/kody-rules';
import WeeklyRecapEmail, {
    weeklyRecapEmailMeta,
} from '@libs/common/email/templates/weekly-recap';

import { NotificationEvent } from '../../../domain/catalog/events';

export interface ResolvedEmailTemplate {
    from: EmailFrom;
    subject: string;
    react: React.ReactElement;
    replyTo?: string;
}

/**
 * Context passed to every template builder. Pulled from runtime config
 * by the adapter so builders stay synchronous and dependency-free.
 */
export interface EmailTemplateContext {
    /** Public web URL used to build links inside the email body. */
    webUrl: string;
}

/**
 * Signature every entry in the registry implements. The metadata
 * argument is the notification payload as carried through the
 * dispatcher — typed loosely here so the registry can stay simple;
 * builders cast to the specific shape they expect.
 */
export type EmailTemplateBuilder = (
    metadata: Record<string, unknown>,
    ctx: EmailTemplateContext,
) => ResolvedEmailTemplate;

/**
 * Maps every email-bearing notification event to its template builder.
 *
 * Adding a new email notification:
 *   1. Add the event to NotificationEvent + NotificationPayloadMap.
 *   2. Add an EVENT_DEFAULTS entry.
 *   3. Add the React Email template under `@libs/common/email/templates`.
 *   4. Register the builder here. No changes to the channel adapter.
 */
export const EMAIL_TEMPLATE_REGISTRY: Partial<
    Record<NotificationEvent, EmailTemplateBuilder>
> = {
    [NotificationEvent.AUTH_FORGOT_PASSWORD]: (metadata, { webUrl }) => {
        const token = metadata.token as string;
        return {
            ...forgotPasswordEmailMeta,
            react: ForgotPasswordEmail({
                resetLink: `${webUrl}/forgot-password/reset?token=${token}`,
            }),
        };
    },

    [NotificationEvent.AUTH_EMAIL_CONFIRMATION]: (metadata, { webUrl }) => {
        const token = metadata.token as string;
        const organizationName = metadata.organizationName as string;
        return {
            ...confirmationEmailMeta,
            react: ConfirmationEmail({
                organizationName,
                confirmLink: `${webUrl}/confirm-email?token=${token}`,
            }),
        };
    },

    [NotificationEvent.TEAM_MEMBER_INVITED]: (metadata) => {
        const user = metadata.user as any;
        const inviterEmail = metadata.inviterEmail as string;
        const inviteLink = metadata.inviteLink as string;
        const inviteeName =
            user?.teamMember?.[0]?.name ??
            user?.email?.split('@')[0] ??
            '';
        const organizationName = user?.organization?.name ?? '';
        const teamName =
            user?.teamMember?.[0]?.team?.name ?? organizationName;
        return {
            ...inviteEmailMeta({ teamName }),
            react: InviteEmail({
                inviteeName,
                inviterEmail,
                organizationName,
                teamName,
                inviteLink,
            }),
        };
    },

    [NotificationEvent.KODY_RULES_GENERATED]: (metadata, { webUrl }) => {
        const rules = metadata.rules as string[];
        const organizationName = metadata.organizationName as string;
        const userName = (metadata as { userName?: string }).userName ?? '';
        return {
            ...kodyRulesEmailMeta({ organizationName }),
            react: KodyRulesEmail({
                userName,
                organizationName,
                rules,
                rulesCount: rules.length,
                rulesLink: `${webUrl}/kody-rules`,
            }),
        };
    },

    [NotificationEvent.SSO_DOMAIN_VERIFICATION]: (metadata, { webUrl }) => {
        const token = metadata.token as string;
        const domain = metadata.domain as string;
        const organizationName = metadata.organizationName as string;
        return {
            ...domainVerificationEmailMeta({ domain }),
            react: DomainVerificationEmail({
                organizationName,
                domain,
                confirmLink: `${webUrl}/api/sso/domain-verification/confirm?token=${token}`,
            }),
        };
    },

    [NotificationEvent.WEEKLY_RECAP]: (metadata) => {
        const props = metadata.props as Record<string, unknown>;
        return {
            ...weeklyRecapEmailMeta({
                kodySuggestions: (props.kodySuggestions as number) ?? 0,
                criticalIssues: (props.criticalIssues as number) ?? 0,
            }),
            react: WeeklyRecapEmail(props as any),
        };
    },
};
