import chalk from 'chalk';
import { Command } from 'commander';
import { rulesService } from '../services/rules.service.js';
import type {
    KodyRule,
    KodyRuleScope,
    KodyRuleSeverity,
} from '../types/rules.js';
import { exitWithCode } from '../utils/cli-exit.js';
import { normalizeCommandError } from '../utils/command-errors.js';
import { cliError, cliInfo } from '../utils/logger.js';

export type RulesCreateOptions = {
    title: string;
    rule: string;
    severity?: KodyRuleSeverity;
    scope?: KodyRuleScope;
    path?: string;
    json?: boolean;
};

export type RulesUpdateOptions = {
    uuid: string;
    title?: string;
    rule?: string;
    severity?: KodyRuleSeverity;
    scope?: KodyRuleScope;
    path?: string;
    json?: boolean;
};

export type RulesViewOptions = {
    uuid?: string;
    title?: string;
    json?: boolean;
};

function printRule(rule: KodyRule): void {
    cliInfo(`Rule UUID: ${rule.uuid}`);
    cliInfo(`Rule Title: ${rule.title}`);
    cliInfo(`Rule: ${rule.rule}`);
    if (rule.severity) {
        cliInfo(`Severity: ${rule.severity}`);
    }
    if (rule.scope) {
        cliInfo(`Scope: ${rule.scope}`);
    }
    if (rule.path) {
        cliInfo(`Path: ${rule.path}`);
    }
}

function printRuleList(rules: KodyRule[]): void {
    if (rules.length === 0) {
        cliInfo(chalk.yellow('No Kody Rules found.'));
        return;
    }

    rules.forEach((rule, index) => {
        printRule(rule);
        if (index < rules.length - 1) {
            cliInfo('');
        }
    });
}

export async function rulesCreateAction(
    options: RulesCreateOptions,
): Promise<void> {
    try {
        const createdRule = await rulesService.createRule({
            title: options.title,
            rule: options.rule,
            severity: options.severity,
            scope: options.scope,
            path: options.path,
        });

        if (options.json) {
            cliInfo(JSON.stringify(createdRule, null, 2));
            return;
        }

        cliInfo(chalk.green('Kody Rule created successfully.'));
        printRule(createdRule);
    } catch (error) {
        const normalized = normalizeCommandError(error);
        cliError(chalk.red(normalized.message));
        exitWithCode(normalized.exitCode);
    }
}

export async function rulesUpdateAction(
    options: RulesUpdateOptions,
): Promise<void> {
    try {
        const updatedRule = await rulesService.updateRule({
            ruleId: options.uuid,
            title: options.title,
            rule: options.rule,
            severity: options.severity,
            scope: options.scope,
            path: options.path,
        });

        if (options.json) {
            cliInfo(JSON.stringify(updatedRule, null, 2));
            return;
        }

        cliInfo(chalk.green('Kody Rule updated successfully.'));
        printRule(updatedRule);
    } catch (error) {
        const normalized = normalizeCommandError(error);
        cliError(chalk.red(normalized.message));
        exitWithCode(normalized.exitCode);
    }
}

export async function rulesViewAction(
    options: RulesViewOptions,
): Promise<void> {
    try {
        const rules = await rulesService.viewRules({
            ruleId: options.uuid,
            ruleName: options.title,
        });

        if (options.json) {
            cliInfo(JSON.stringify(rules, null, 2));
            return;
        }

        printRuleList(rules);
    } catch (error) {
        const normalized = normalizeCommandError(error);
        cliError(chalk.red(normalized.message));
        exitWithCode(normalized.exitCode);
    }
}

export const rulesCommand = new Command('rules')
    .description('Create, update, and view Kody Rules')
    .showHelpAfterError();

rulesCommand
    .command('create')
    .description('Create a new Kody Rule')
    .requiredOption('--title <title>', 'Rule title')
    .requiredOption('--rule <rule>', 'Rule content/description')
    .option(
        '--severity <severity>',
        'Rule severity (low, medium, high, critical)',
    )
    .option('--scope <scope>', "Rule scope ('pull request' or 'file')")
    .option('--path <glob>', 'Optional glob pattern for file targeting')
    .option('--json', 'Output created rule as JSON')
    .action(rulesCreateAction);

rulesCommand
    .command('update')
    .description('Update an existing Kody Rule')
    .requiredOption('--uuid <uuid>', 'Rule UUID to update')
    .option('--title <title>', 'Updated rule title')
    .option('--rule <rule>', 'Updated rule content/description')
    .option(
        '--severity <severity>',
        'Updated rule severity (low, medium, high, critical)',
    )
    .option('--scope <scope>', "Updated rule scope ('pull request' or 'file')")
    .option('--path <glob>', 'Updated glob pattern for file targeting')
    .option('--json', 'Output updated rule as JSON')
    .action(rulesUpdateAction);

rulesCommand
    .command('view')
    .description('View Kody Rules')
    .option('--uuid <uuid>', 'Rule UUID to fetch')
    .option('--title <title>', 'Rule title to fetch when UUID is not provided')
    .option('--json', 'Output rules as JSON')
    .action(rulesViewAction);
