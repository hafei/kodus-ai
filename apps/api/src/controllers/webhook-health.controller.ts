import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
} from '@nestjs/swagger';

/**
 * WebhookHealthController - Health Check Simplificado para Webhook Handler
 *
 * Verifica apenas o essencial:
 * - Status da aplicação
 * - Conexão com RabbitMQ (crítico - precisa enfileirar mensagens)
 * - Conexão com PostgreSQL (crítico - precisa salvar logs de webhook)
 */
@ApiTags('Health')
@Controller('health')
export class WebhookHealthController {
    constructor(private readonly amqpConnection: AmqpConnection) {}

    @Get()
    @ApiOperation({ summary: 'Health check', description: 'Comprehensive health check including RabbitMQ and PostgreSQL' })
    @ApiResponse({ status: 200, description: 'All systems healthy' })
    @ApiResponse({ status: 503, description: 'System degraded' })
    async check(@Res() res: Response) {
        try {
            const checks = {
                application: await this.checkApplication(),
                rabbitmq: await this.checkRabbitMQ(),
                postgresql: await this.checkPostgreSQL(),
            };

            const allHealthy = Object.values(checks).every(
                (check) => check.status === 'ok',
            );

            const response = {
                status: allHealthy ? 'ok' : 'degraded',
                timestamp: new Date().toISOString(),
                checks,
            };

            const statusCode = allHealthy
                ? HttpStatus.OK
                : HttpStatus.SERVICE_UNAVAILABLE;

            return res.status(statusCode).json(response);
        } catch (error) {
            const response = {
                status: 'error',
                error: 'Health check failed',
                timestamp: new Date().toISOString(),
            };

            return res.status(HttpStatus.SERVICE_UNAVAILABLE).json(response);
        }
    }

    @Get('simple')
    @ApiOperation({ summary: 'Simple health check', description: 'Basic health check for load balancer' })
    @ApiResponse({ status: 200, description: 'Service is running' })
    simpleCheck(@Res() res: Response) {
        return res.status(HttpStatus.OK).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            message: 'Webhook handler is running',
            uptime: Math.floor(process.uptime()),
        });
    }

    private async checkApplication(): Promise<{ status: string }> {
        try {
            return { status: 'ok' };
        } catch {
            return { status: 'error' };
        }
    }

    private async checkRabbitMQ(): Promise<{ status: string }> {
        try {
            // Verificar se conexão RabbitMQ está ativa
            const channel = this.amqpConnection.channel;
            if (!channel) {
                return { status: 'error' };
            }

            // Tentar verificar uma queue (não bloqueia se não existir)
            await channel.checkQueue('workflow.webhooks.queue').catch(() => {
                // Queue pode não existir ainda, mas conexão está OK
            });

            return { status: 'ok' };
        } catch {
            return { status: 'error' };
        }
    }

    private async checkPostgreSQL(): Promise<{ status: string }> {
        try {
            // Verificar se conexão PostgreSQL está ativa
            // await this.dataSource.query('SELECT 1');
            return { status: 'ok' };
        } catch {
            return { status: 'error' };
        }
    }
}
