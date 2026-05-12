import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import { IEmailProvider } from './email-provider.contract';

@Injectable()
export class ResendEmailProvider implements IEmailProvider {
    private readonly client: Resend;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.getOrThrow<string>('RESEND_API_KEY');
        this.client = new Resend(apiKey);
    }

    async send(input: {
        from: string;
        to: string;
        subject: string;
        html: string;
        replyTo?: string;
    }): Promise<{ id: string }> {
        const result = await this.client.emails.send({
            from: input.from,
            to: input.to,
            subject: input.subject,
            html: input.html,
            replyTo: input.replyTo,
        });

        if (result.error) {
            throw new Error(
                `Resend send failed: ${result.error.name} — ${result.error.message}`,
            );
        }

        return { id: result.data?.id ?? 'unknown' };
    }
}
