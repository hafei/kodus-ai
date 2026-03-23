import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import { ExceptionsFilter } from './exceptions.filter';

jest.mock('@sentry/nestjs', () => ({
    withScope: jest.fn((callback) =>
        callback({
            setTag: jest.fn(),
            setExtra: jest.fn(),
        }),
    ),
    captureException: jest.fn(),
}));

describe('ExceptionsFilter', () => {
    const response = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
    };
    const request = {
        url: '/test',
        method: 'GET',
        requestId: 'req-1',
    };
    const host = {
        switchToHttp: () => ({
            getResponse: () => response,
            getRequest: () => request,
        }),
    };

    let filter: ExceptionsFilter;

    beforeEach(() => {
        jest.clearAllMocks();
        filter = new ExceptionsFilter(
            {
                get: jest.fn().mockReturnValue('api'),
            } as unknown as ConfigService,
        );
    });

    it('does not capture 4xx http exceptions in sentry', () => {
        filter.catch(
            new BadRequestException('invalid payload'),
            host as any,
        );

        expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('captures 5xx http exceptions in sentry', () => {
        filter.catch(
            new InternalServerErrorException('server exploded'),
            host as any,
        );

        expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });
});
