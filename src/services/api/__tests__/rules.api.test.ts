import { describe, expect, it, vi } from 'vitest';
import { RealRulesApi } from '../rules.api.js';

describe('RealRulesApi', () => {
    it('creates a rule with team-key auth', async () => {
        const requestWithRetry = vi.fn().mockResolvedValue({
            uuid: 'rule-1',
            title: 'Use async/await',
            rule: 'Prefer async/await over raw promises',
            severity: 'high',
            scope: 'file',
            path: '**/*.ts',
        });

        const api = new RealRulesApi(requestWithRetry);
        await api.createRule('kodus_team_key', {
            title: 'Use async/await',
            rule: 'Prefer async/await over raw promises',
            severity: 'high',
            scope: 'file',
            path: '**/*.ts',
        });

        expect(requestWithRetry).toHaveBeenCalledWith('/cli/kody-rules', {
            method: 'POST',
            headers: {
                'X-Team-Key': 'kodus_team_key',
            },
            body: JSON.stringify({
                title: 'Use async/await',
                rule: 'Prefer async/await over raw promises',
                severity: 'high',
                scope: 'file',
                path: '**/*.ts',
            }),
        });
    });

    it('updates a rule with bearer auth', async () => {
        const requestWithRetry = vi.fn().mockResolvedValue({
            uuid: 'rule-1',
            title: 'Use async/await',
            rule: 'Updated description',
            severity: 'critical',
            scope: 'file',
        });

        const api = new RealRulesApi(requestWithRetry);
        await api.updateRule('eyJ.test.token', 'rule-1', {
            rule: 'Updated description',
            severity: 'critical',
        });

        expect(requestWithRetry).toHaveBeenCalledWith(
            '/cli/kody-rules/rule-1',
            {
                method: 'PATCH',
                headers: {
                    Authorization: 'Bearer eyJ.test.token',
                },
                body: JSON.stringify({
                    rule: 'Updated description',
                    severity: 'critical',
                }),
            },
        );
    });

    it('prefers ruleId over ruleName when viewing rules', async () => {
        const requestWithRetry = vi.fn().mockResolvedValue([]);

        const api = new RealRulesApi(requestWithRetry);
        await api.viewRules('kodus_team_key', {
            ruleId: 'rule-123',
            ruleName: 'ignored-name',
        });

        expect(requestWithRetry).toHaveBeenCalledWith(
            '/cli/kody-rules?ruleId=rule-123',
            {
                headers: {
                    'X-Team-Key': 'kodus_team_key',
                },
            },
        );
    });
});
