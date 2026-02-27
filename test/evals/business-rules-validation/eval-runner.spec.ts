import fs from 'node:fs';
import path from 'node:path';

import { runBlueprint } from '@libs/shared/blueprint/blueprint.runner';
import { LLMStep } from '@libs/shared/blueprint/blueprint.types';
import { createBusinessRulesBlueprint } from '@libs/agents/infrastructure/services/kodus-flow/business-rules-validation/blueprint';
import { BusinessRulesContext } from '@libs/agents/infrastructure/services/kodus-flow/business-rules-validation/types';
import { SkillCapabilityRuntimeConfig, ToolCaller } from '@libs/agents/skills/runtime/skill-runtime.types';

type TaskContextFixture = {
    id?: string;
    title?: string;
    description?: string;
    acceptanceCriteria?: string[];
};

type EvalFixture = {
    name: string;
    input: {
        pullRequestNumber: number;
        prBody: string;
        prDiff: string;
        taskContext: string | TaskContextFixture;
        providerType?: string;
        taskContextToolName?: string;
    };
    expectedTrajectory: Array<
        | { capability: string; status: 'success' | 'failed' | 'skipped' }
        | {
              step: string;
              output?: { taskQuality?: 'EMPTY' | 'MINIMAL' | 'PARTIAL' | 'COMPLETE' };
              passed?: boolean;
              status?: 'success';
          }
    >;
    expectedOutcome: {
        needsMoreInfo: boolean;
        summaryContains?: string[];
    };
};

const FIXTURES_DIR = path.resolve(
    process.cwd(),
    'test/evals/business-rules-validation/fixtures',
);

function loadFixtures(): EvalFixture[] {
    return fs
        .readdirSync(FIXTURES_DIR)
        .filter((file) => file.endsWith('.json'))
        .sort()
        .map((file) => {
            const absolutePath = path.join(FIXTURES_DIR, file);
            return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as EvalFixture;
        });
}

function createMockToolCaller(fixture: EvalFixture): ToolCaller {
    const hasStructuredTaskContext =
        typeof fixture.input.taskContext === 'object' &&
        fixture.input.taskContext !== null;
    const taskContextToolName = fixture.input.taskContextToolName ?? 'getJiraIssue';

    const registeredTools = [
        { name: 'KODUS_GET_PULL_REQUEST' },
        { name: 'KODUS_GET_PULL_REQUEST_DIFF' },
        ...(hasStructuredTaskContext ? [{ name: taskContextToolName }] : []),
    ];

    return {
        callTool: async (toolName: string) => {
            if (toolName === 'KODUS_GET_PULL_REQUEST') {
                return {
                    result: {
                        data: {
                            body: fixture.input.prBody,
                        },
                    },
                };
            }

            if (toolName === 'KODUS_GET_PULL_REQUEST_DIFF') {
                return {
                    result: {
                        data: fixture.input.prDiff,
                    },
                };
            }

            if (toolName === taskContextToolName && hasStructuredTaskContext) {
                const task = fixture.input.taskContext as TaskContextFixture;
                return {
                    result: {
                        data: {
                            key: task.id,
                            fields: {
                                summary: task.title,
                                description: task.description,
                                acceptanceCriteria: task.acceptanceCriteria,
                            },
                        },
                    },
                };
            }

            return { result: {} };
        },
        getRegisteredTools: () => registeredTools,
        getToolsForLLM: () => [
            {
                name: taskContextToolName,
                parameters: {
                    required: ['issueIdOrKey'],
                    properties: {
                        issueIdOrKey: {
                            type: 'string',
                            description: 'Issue key (e.g. PROJ-123)',
                        },
                    },
                },
            },
        ],
    };
}

function createCapabilityRuntime(fixture: EvalFixture): SkillCapabilityRuntimeConfig {
    const providerType = fixture.input.providerType ?? 'jira';
    const taskContextToolName = fixture.input.taskContextToolName ?? 'getJiraIssue';

    return {
        capabilities: ['pr.metadata.read', 'pr.diff.read', 'task.context.read'],
        allowedTools: [
            'KODUS_GET_PULL_REQUEST',
            'KODUS_GET_PULL_REQUEST_DIFF',
            taskContextToolName,
        ],
        capabilityToolMap: {
            'pr.metadata.read': ['KODUS_GET_PULL_REQUEST'],
            'pr.diff.read': ['KODUS_GET_PULL_REQUEST_DIFF'],
            'task.context.read': [taskContextToolName],
        },
        fetcherPolicy: {
            toolMode: 'any',
            allowWithoutTools: false,
        },
        providerType,
        allProviderTypes: [providerType],
    };
}

describe('business-rules-validation eval runner', () => {
    const fixtures = loadFixtures();

    test.each(fixtures)('runs fixture: $name', async (fixture) => {
        const toolCaller = createMockToolCaller(fixture);
        const capabilityRuntime = createCapabilityRuntime(fixture);
        const hooks = {
            getSeedTaskContextTools: jest.fn(async () =>
                typeof fixture.input.taskContext === 'object' &&
                fixture.input.taskContext !== null
                    ? [fixture.input.taskContextToolName ?? 'getJiraIssue']
                    : [],
            ),
            getCachedTaskContextTools: jest.fn(async () => []),
            saveCachedTaskContextTools: jest.fn(async () => undefined),
            resolvePreferredTool: jest.fn(async () => undefined),
            recordExecution: jest.fn(async () => undefined),
        };

        const steps = createBusinessRulesBlueprint(
            toolCaller,
            capabilityRuntime,
            hooks,
        );

        const initialContext: BusinessRulesContext = {
            organizationAndTeamData: {
                organizationId: 'org-eval',
                teamId: 'team-eval',
            },
            userLanguage: 'en-US',
            prepareContext: {
                repository: {
                    id: 'repo-eval',
                    name: 'repo-eval',
                },
                pullRequest: {
                    pullRequestNumber: fixture.input.pullRequestNumber,
                },
                userQuestion:
                    typeof fixture.input.taskContext === 'object' &&
                    fixture.input.taskContext !== null &&
                    fixture.input.taskContext.id
                        ? `@kody -v business-logic ${fixture.input.taskContext.id}`
                        : '@kody -v business-logic',
                pullRequestDescription: '',
                taskContext:
                    typeof fixture.input.taskContext === 'string'
                        ? fixture.input.taskContext
                        : undefined,
                enableAgenticFallback: false,
                taskContextResolutionMode: 'cache_first',
            },
        };

        const result = await runBlueprint<BusinessRulesContext>({
            steps,
            context: initialContext,
            runLLMStep: async (_step: LLMStep, ctx: BusinessRulesContext) => ({
                ...ctx,
                validationResult: {
                    needsMoreInfo: fixture.expectedOutcome.needsMoreInfo,
                    summary:
                        fixture.expectedOutcome.needsMoreInfo === true
                            ? ''
                            : `Validation summary for ${fixture.name}`,
                    missingInfo:
                        fixture.expectedOutcome.needsMoreInfo === true
                            ? 'Need task information'
                            : '',
                },
                formattedResponse:
                    fixture.expectedOutcome.needsMoreInfo === true
                        ? 'Need task information'
                        : `Validation summary for ${fixture.name}`,
            }),
        });

        for (const expected of fixture.expectedTrajectory) {
            if ('capability' in expected) {
                const trace = result.context.capabilityExecutionTrace?.find(
                    (item) =>
                        item.capability === expected.capability &&
                        item.status === expected.status,
                );
                expect(trace).toBeDefined();
                continue;
            }

            if ('passed' in expected && expected.passed === false) {
                expect(result.skippedAt).toBe(expected.step);
                continue;
            }

            expect(result.completedSteps).toContain(expected.step);
            if (expected.output?.taskQuality) {
                expect(result.context.taskQuality).toBe(
                    expected.output.taskQuality,
                );
            }
        }

        expect(result.context.validationResult?.needsMoreInfo).toBe(
            fixture.expectedOutcome.needsMoreInfo,
        );

        if (fixture.expectedOutcome.summaryContains?.length) {
            const summarySource =
                result.context.taskContext ?? result.context.formattedResponse ?? '';
            for (const token of fixture.expectedOutcome.summaryContains) {
                expect(summarySource.toLowerCase()).toContain(token.toLowerCase());
            }
        }
    });
});
