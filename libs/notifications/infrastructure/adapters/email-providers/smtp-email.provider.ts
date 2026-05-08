import { createLogger } from '@kodus/flow';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { IEmailProvider, SendEmailPayload } from './email-provider.contract';

/**
 * SMTP email provider using nodemailer.
 *
 * Only loaded when NOTIFICATION_EMAIL_PROVIDER=smtp.
 * Requires `nodemailer` to be installed: `yarn add nodemailer @types/nodemailer`
 */
@Injectable()
export class SmtpEmailProvider implements IEmailProvider {
    private readonly logger = createLogger(SmtpEmailProvider.name);
    private transporter: any;
    private readonly from: string;

    constructor(private readonly configService: ConfigService) {
        this.from =
            configService.get<string>('SMTP_FROM') ??
            'noreply@notifications.kodus.io';
    }

    private async getTransporter(): Promise<any> {
        if (this.transporter) return this.transporter;

        let nodemailer: any;
        try {
            // @ts-ignore — nodemailer is an optional peer dependency
            nodemailer = await import('nodemailer');
        } catch {
            throw new Error(
                'nodemailer is not installed. Run: yarn add nodemailer @types/nodemailer',
            );
        }

        this.transporter = nodemailer.createTransport({
            host: this.configService.get<string>('SMTP_HOST'),
            port: parseInt(
                this.configService.get<string>('SMTP_PORT', '587'),
                10,
            ),
            secure: this.configService.get<string>('SMTP_SECURE') === 'true',
            auth: {
                user: this.configService.get<string>('SMTP_USER'),
                pass: this.configService.get<string>('SMTP_PASS'),
            },
        });

        return this.transporter;
    }

    async send(payload: SendEmailPayload): Promise<{ id: string }> {
        try {
            const transport = await this.getTransporter();
            const info = await transport.sendMail({
                from: payload.from ?? this.from,
                to: payload.to,
                subject: payload.subject,
                html: payload.html,
                replyTo: payload.replyTo,
            });

            this.logger.log({
                message: 'Email sent via SMTP',
                context: SmtpEmailProvider.name,
                metadata: {
                    to: payload.to,
                    subject: payload.subject,
                    messageId: info?.messageId,
                },
            });

            return { id: info?.messageId ?? '' };
        } catch (error) {
            this.logger.error({
                message: 'SMTP email send failed',
                error: error instanceof Error ? error : new Error(String(error)),
                context: SmtpEmailProvider.name,
                metadata: {
                    to: payload.to,
                    subject: payload.subject,
                },
            });
            throw error;
        }
    }
}
