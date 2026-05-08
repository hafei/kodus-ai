import { createLogger } from '@kodus/flow';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as React from 'react';
import { render } from '@react-email/render';

import { EMAIL_FROM, formatFromAddress, EmailFrom } from '@libs/common/email/from';
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

import {
    IChannelAdapter,
    NotificationDeliveryContext,
} from '../../../domain/contracts/channel-adapter.contract';
import { NotificationChannel } from '../../../domain/enums/channel.enum';
import { NotificationEvent } from '../../../domain/catalog/events';
import {
    IEmailProvider,
    EMAIL_PROVIDER_TOKEN,
} from '../../adapters/email-providers/email-provider.contract';

interface ResolvedTemplate {
    from: EmailFrom;
    subject: string;
    react: React.ReactElement;
    replyTo?: string;
}

/**
 * Maps notification events to React Email templates and sends via the
 * active email provider (Resend or SMTP).
 */
@Injectable()
export class EmailChannelAdapter implements IChannelAdapter {
    readonly channel = NotificationChannel.EMAIL;
    private readonly logger = createLogger(EmailChannelAdapter.name);

    constructor(
        @Inject(EMAIL_PROVIDER_TOKEN)
        private readonly emailProvider: IEmailProvider,
        private readonly configService: ConfigService,
    ) {}

    async deliver(context: NotificationDeliveryContext): Promise<void> {
        const { event, metadata, userEmail } = context;

        const template = this.resolveTemplate(event, metadata);
        if (!template) {
            this.logger.warn({
                message: `No email template registered for event: ${event}`,
                context: EmailChannelAdapter.name,
                metadata: { event, deliveryId: context.deliveryId },
            });
            return;
        }

        const html = await render(template.react);

        await this.emailProvider.send({
            from: formatFromAddress(template.from),
            to: userEmail,
            subject: template.subject,
            html,
            replyTo: template.replyTo,
        });
    }

    private resolveTemplate(
        event: NotificationEvent,
        metadata: Record<string, unknown>,
    ): ResolvedTemplate | null {
        const webUrl = this.configService.get<string>(
            'API_USER_INVITE_BASE_URL',
            '',
        );

        switch (event) {
            case NotificationEvent.AUTH_FORGOT_PASSWORD: {
                const token = metadata.token as string;
                const resetLink = `${webUrl}/forgot-password/reset?token=${token}`;
                return {
                    ...forgotPasswordEmailMeta,
                    react: ForgotPasswordEmail({ resetLink }),
                };
            }

            case NotificationEvent.AUTH_EMAIL_CONFIRMATION: {
                const token = metadata.token as string;
                const organizationName =
                    metadata.organizationName as string;
                const confirmLink = `${webUrl}/confirm-email?token=${token}`;
                return {
                    ...confirmationEmailMeta,
                    react: ConfirmationEmail({
                        organizationName,
                        confirmLink,
                    }),
                };
            }

            case NotificationEvent.TEAM_MEMBER_INVITED: {
                const user = metadata.user as any;
                const inviterEmail = metadata.inviterEmail as string;
                const inviteLink = metadata.inviteLink as string;
                const inviteeName = user?.teamMember?.[0]?.name ?? user?.email?.split('@')[0] ?? '';
                const organizationName = user?.organization?.name ?? '';
                const teamName = user?.teamMember?.[0]?.team?.name ?? organizationName;
                const meta = inviteEmailMeta({ teamName });
                return {
                    ...meta,
                    react: InviteEmail({
                        inviteeName,
                        inviterEmail,
                        organizationName,
                        teamName,
                        inviteLink,
                    }),
                };
            }

            case NotificationEvent.KODY_RULES_GENERATED: {
                const rules = metadata.rules as string[];
                const organizationName =
                    metadata.organizationName as string;
                const userName = (metadata as any).userName ?? '';
                const meta = kodyRulesEmailMeta({ organizationName });
                return {
                    ...meta,
                    react: KodyRulesEmail({
                        userName,
                        organizationName,
                        rules,
                        rulesCount: rules.length,
                        rulesLink: `${webUrl}/kody-rules`,
                    }),
                };
            }

            case NotificationEvent.SSO_DOMAIN_VERIFICATION: {
                const token = metadata.token as string;
                const domain = metadata.domain as string;
                const organizationName =
                    metadata.organizationName as string;
                const confirmLink = `${webUrl}/api/sso/domain-verification/confirm?token=${token}`;
                const meta = domainVerificationEmailMeta({ domain });
                return {
                    ...meta,
                    react: DomainVerificationEmail({
                        organizationName,
                        domain,
                        confirmLink,
                    }),
                };
            }

            case NotificationEvent.WEEKLY_RECAP: {
                const props = metadata.props as Record<string, unknown>;
                const meta = weeklyRecapEmailMeta({
                    kodySuggestions: (props.kodySuggestions as number) ?? 0,
                    criticalIssues: (props.criticalIssues as number) ?? 0,
                });
                return {
                    ...meta,
                    react: WeeklyRecapEmail(props as any),
                };
            }

            default:
                return null;
        }
    }
}
