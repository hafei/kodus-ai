import { Inject, Injectable } from '@nestjs/common';
import { createLogger } from '@kodus/flow';

import { BasePipelineStage } from '@libs/core/infrastructure/pipeline/abstracts/base-stage.abstract';
import { StageVisibility } from '@libs/core/infrastructure/pipeline/enums/stage-visibility.enum';
import {
    IPullRequestsService,
    PULL_REQUESTS_SERVICE_TOKEN,
} from '@libs/platformData/domain/pullRequests/contracts/pullRequests.service.contracts';

import { CodeReviewPipelineContext } from '../context/code-review-pipeline.context';

/**
 * Persists the high-level outcome of the agent-engine review onto the PR
 * record so it survives beyond the pipeline run. Consumed by:
 *   - the auto-approve cron, which must skip PRs whose last review FAILED
 *   - the dashboard, which can show "review failed: <reason>" badges
 *
 * Runs at the end of the agent branch so it observes whatever
 * AgentReviewStage derived (`context.reviewStatus`, `context.lastReviewError`).
 * Marked `partial` so a Mongo write failure here never red-flags the run —
 * the in-memory context still drives the end-review comment downstream.
 *
 * Skipped silently when reviewStatus is absent (e.g. legacy EE engine).
 */
@Injectable()
export class PersistReviewStatusStage extends BasePipelineStage<CodeReviewPipelineContext> {
    readonly stageName = 'PersistReviewStatusStage';
    readonly label = 'Persisting Review Status';
    readonly visibility = StageVisibility.SECONDARY;
    readonly errorSeverity = 'partial' as const;

    private readonly logger = createLogger(PersistReviewStatusStage.name);

    constructor(
        @Inject(PULL_REQUESTS_SERVICE_TOKEN)
        private readonly pullRequestsService: IPullRequestsService,
    ) {
        super();
    }

    protected async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        const { reviewStatus, pullRequest, repository, organizationAndTeamData } =
            context;

        if (!reviewStatus) {
            return context;
        }

        try {
            const existing =
                await this.pullRequestsService.findByNumberAndRepositoryId(
                    pullRequest.number,
                    repository.id,
                    organizationAndTeamData,
                );

            // The PR record is created upstream by aggregateAndSaveDataStructure.
            // If it isn't there yet, log and move on — we still set the in-memory
            // status so the end-review comment renders the right variant.
            if (!existing) {
                this.logger.warn({
                    message: `PR record not found while persisting review status for PR#${pullRequest.number}`,
                    context: this.stageName,
                    metadata: {
                        organizationAndTeamData,
                        prNumber: pullRequest.number,
                        repositoryId: repository.id,
                        reviewStatus,
                    },
                });
                return context;
            }

            await this.pullRequestsService.update(existing, {
                reviewStatus,
                updatedAt: new Date().toISOString(),
            });

            this.logger.log({
                message: `Persisted reviewStatus=${reviewStatus} for PR#${pullRequest.number}`,
                context: this.stageName,
                metadata: {
                    organizationAndTeamData,
                    prNumber: pullRequest.number,
                    reviewStatus,
                    errorCategory: context.lastReviewError?.category,
                    provider: context.lastReviewError?.provider,
                    reviewAborted: context.reviewAborted,
                },
            });
        } catch (error) {
            this.logger.error({
                message: `Failed to persist reviewStatus for PR#${pullRequest.number}`,
                context: this.stageName,
                error,
                metadata: {
                    organizationAndTeamData,
                    prNumber: pullRequest.number,
                    reviewStatus,
                },
            });

            context = this.updateContext(context, (draft) => {
                draft.errors.push({
                    stage: this.stageName,
                    error:
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                    severity: 'partial',
                    metadata: {
                        prNumber: pullRequest.number,
                        reviewStatus,
                    },
                });
            });
        }

        return context;
    }
}
