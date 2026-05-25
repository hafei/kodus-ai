import { SelfHostedLicenseService } from './self-hosted-license.service';

/**
 * Regression guard: the self-hosted installer injects the license as
 * API_KODUS_LICENSE_KEY (the API_-prefixed convention used across the
 * codebase). The service used to read the unprefixed KODUS_LICENSE_KEY, so
 * the license was never found from env and every enterprise-tier feature
 * (SSO config, user activity logs) 403'd on a correctly licensed install.
 */
describe('SelfHostedLicenseService.getLicenseKey', () => {
    const ENV_KEYS = ['API_KODUS_LICENSE_KEY', 'KODUS_LICENSE_KEY'];
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const k of ENV_KEYS) {
            saved[k] = process.env[k];
            delete process.env[k];
        }
    });
    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (saved[k] === undefined) delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    // DB lookup miss → falls through to env.
    const makeService = (dbValue: unknown = null) => {
        const orgParams = {
            findByKey: jest.fn().mockResolvedValue(
                dbValue == null ? null : { configValue: dbValue },
            ),
        };
        return new SelfHostedLicenseService(orgParams as any);
    };
    const orgTeam = { organizationId: 'org-1', teamId: 'team-1' } as any;
    const getKey = (svc: SelfHostedLicenseService) =>
        (svc as any).getLicenseKey(orgTeam) as Promise<string | null>;

    it('reads API_KODUS_LICENSE_KEY from env (the installer-provided name)', async () => {
        process.env.API_KODUS_LICENSE_KEY = 'jwt-from-api-prefixed';
        expect(await getKey(makeService())).toBe('jwt-from-api-prefixed');
    });

    it('falls back to the unprefixed KODUS_LICENSE_KEY when present', async () => {
        process.env.KODUS_LICENSE_KEY = 'jwt-unprefixed';
        expect(await getKey(makeService())).toBe('jwt-unprefixed');
    });

    it('prefers the API_-prefixed name over the unprefixed fallback', async () => {
        process.env.API_KODUS_LICENSE_KEY = 'prefixed-wins';
        process.env.KODUS_LICENSE_KEY = 'unprefixed-loses';
        expect(await getKey(makeService())).toBe('prefixed-wins');
    });

    it('prefers the DB-stored key over env', async () => {
        process.env.API_KODUS_LICENSE_KEY = 'env-loses';
        expect(await getKey(makeService({ key: 'db-wins' }))).toBe('db-wins');
    });

    it('returns null when neither DB nor env has a key', async () => {
        expect(await getKey(makeService())).toBeNull();
    });
});
