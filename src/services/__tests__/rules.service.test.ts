import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/index.js', () => ({
    api: {
        rules: {
            createRule: vi.fn(),
            updateRule: vi.fn(),
            viewRules: vi.fn(),
        },
    },
}));

vi.mock('../auth.service.js', () => ({
    authService: {
        getValidToken: vi.fn(),
    },
}));

import { CommandError } from '../../utils/command-errors.js';
import { api } from '../api/index.js';
import { authService } from '../auth.service.js';
import { rulesService } from '../rules.service.js';

const mockRulesApi = vi.mocked(api.rules);
const mockAuthService = vi.mocked(authService);

describe('rulesService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuthService.getValidToken.mockResolvedValue('kodus_team_key');
    });

    it('applies severity and scope defaults on create', async () => {
        mockRulesApi.createRule.mockResolvedValue({
            uuid: 'rule-1',
            title: 'Use async/await',
            rule: 'Prefer async/await',
            severity: 'medium',
            scope: 'file',
        });

        await rulesService.createRule({
            title: 'Use async/await',
            rule: 'Prefer async/await',
        });

        expect(mockRulesApi.createRule).toHaveBeenCalledWith('kodus_team_key', {
            title: 'Use async/await',
            rule: 'Prefer async/await',
            severity: 'medium',
            scope: 'file',
        });
    });

    it('validates severity values', async () => {
        await expect(
            rulesService.createRule({
                title: 'Rule',
                rule: 'Desc',
                severity: 'urgent' as any,
            }),
        ).rejects.toEqual(
            expect.objectContaining<Partial<CommandError>>({
                code: 'INVALID_INPUT',
            }),
        );
    });

    it('requires at least one field for update', async () => {
        await expect(
            rulesService.updateRule({
                ruleId: 'rule-1',
            }),
        ).rejects.toEqual(
            expect.objectContaining<Partial<CommandError>>({
                code: 'INVALID_INPUT',
            }),
        );
    });

    it('requires rule-id for updates', async () => {
        await expect(
            rulesService.updateRule({
                ruleId: '',
                rule: 'updated',
            }),
        ).rejects.toEqual(
            expect.objectContaining<Partial<CommandError>>({
                code: 'INVALID_INPUT',
            }),
        );
    });

    it('uses ruleId precedence for view queries', async () => {
        mockRulesApi.viewRules.mockResolvedValue([]);

        await rulesService.viewRules({
            ruleId: 'rule-9',
            ruleName: 'Ignored Rule Name',
        });

        expect(mockRulesApi.viewRules).toHaveBeenCalledWith('kodus_team_key', {
            ruleId: 'rule-9',
        });
    });
});
