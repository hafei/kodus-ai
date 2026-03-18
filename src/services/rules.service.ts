import type {
    CreateKodyRuleRequest,
    KodyRule,
    KodyRuleScope,
    KodyRuleSeverity,
    UpdateKodyRuleRequest,
    ViewKodyRulesRequest,
} from '../types/rules.js';
import { CommandError } from '../utils/command-errors.js';
import { api } from './api/index.js';
import { authService } from './auth.service.js';

export type UpdateKodyRuleInput = {
    ruleId: string;
} & UpdateKodyRuleRequest;

const VALID_SEVERITIES: KodyRuleSeverity[] = [
    'low',
    'medium',
    'high',
    'critical',
];

const VALID_SCOPES: KodyRuleScope[] = ['pull request', 'file'];

class RulesService {
    async createRule(input: CreateKodyRuleRequest): Promise<KodyRule> {
        const accessToken = await authService.getValidToken();
        const payload: CreateKodyRuleRequest = {
            title: this.requireText(input.title, 'name'),
            rule: this.requireText(input.rule, 'description'),
            severity: this.normalizeSeverity(input.severity ?? 'medium'),
            scope: this.normalizeScope(input.scope ?? 'file'),
        };

        const path = this.normalizeOptionalText(input.path);
        if (path) {
            payload.path = path;
        }

        return api.rules.createRule(accessToken, payload);
    }

    async updateRule(input: UpdateKodyRuleInput): Promise<KodyRule> {
        const accessToken = await authService.getValidToken();
        const ruleId = this.requireText(input.ruleId, 'rule-id');

        const payload: UpdateKodyRuleRequest = {};
        const title = this.normalizeOptionalText(input.title);
        if (title) {
            payload.title = title;
        }

        const rule = this.normalizeOptionalText(input.rule);
        if (rule) {
            payload.rule = rule;
        }

        if (input.severity !== undefined) {
            payload.severity = this.normalizeSeverity(input.severity);
        }

        if (input.scope !== undefined) {
            payload.scope = this.normalizeScope(input.scope);
        }

        const path = this.normalizeOptionalText(input.path);
        if (path) {
            payload.path = path;
        }

        if (Object.keys(payload).length === 0) {
            throw new CommandError(
                'INVALID_INPUT',
                'Provide at least one field to update: --name, --description, --severity, --scope, or --filepath.',
            );
        }

        return api.rules.updateRule(accessToken, ruleId, payload);
    }

    async viewRules(input: ViewKodyRulesRequest = {}): Promise<KodyRule[]> {
        const accessToken = await authService.getValidToken();
        const query: ViewKodyRulesRequest = {};

        const ruleId = this.normalizeOptionalText(input.ruleId);
        const ruleName = this.normalizeOptionalText(input.ruleName);

        if (ruleId) {
            query.ruleId = ruleId;
        } else if (ruleName) {
            query.ruleName = ruleName;
        }

        return api.rules.viewRules(accessToken, query);
    }

    private normalizeSeverity(value: string): KodyRuleSeverity {
        const normalized = value.trim().toLowerCase() as KodyRuleSeverity;
        if (!VALID_SEVERITIES.includes(normalized)) {
            throw new CommandError(
                'INVALID_INPUT',
                `Invalid severity '${value}'. Use one of: ${VALID_SEVERITIES.join(', ')}.`,
            );
        }

        return normalized;
    }

    private normalizeScope(value: string): KodyRuleScope {
        const normalized = value.trim().toLowerCase() as KodyRuleScope;
        if (!VALID_SCOPES.includes(normalized)) {
            throw new CommandError(
                'INVALID_INPUT',
                `Invalid scope '${value}'. Use one of: ${VALID_SCOPES.join(', ')}.`,
            );
        }

        return normalized;
    }

    private requireText(value: string, field: string): string {
        const normalized = value.trim();
        if (!normalized) {
            throw new CommandError(
                'INVALID_INPUT',
                `--${field} cannot be empty.`,
            );
        }

        return normalized;
    }

    private normalizeOptionalText(value?: string): string | undefined {
        const normalized = value?.trim();
        return normalized ? normalized : undefined;
    }
}

export { RulesService };
export const rulesService = new RulesService();
