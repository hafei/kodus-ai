import { TASK_QUALITY_ANALYZER_POLICY } from './task-quality.rules';
import { BusinessRulesContext } from './types';

export function buildBusinessRulesAnalysisPrompt(ctx: BusinessRulesContext): string {
    return `Perform business rules gap analysis.

TASK_QUALITY: ${ctx.taskQuality}

TASK_CONTEXT:
${ctx.taskContext ?? '(none)'}

PR_DIFF:
${ctx.prDiff ?? '(not available)'}

PR_DESCRIPTION:
${ctx.prBody ?? '(not available)'}

USER LANGUAGE: ${ctx.userLanguage}

TASK_QUALITY_POLICY:
${TASK_QUALITY_ANALYZER_POLICY}

Follow the instructions in your system prompt exactly. Return ONLY a JSON object.`;
}
