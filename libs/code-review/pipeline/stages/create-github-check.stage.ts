import { Injectable } from '@nestjs/common';
import { BasePipelineStage } from '@libs/core/infrastructure/pipeline/abstracts/base-stage.abstract';
import { CodeReviewPipelineContext } from '../context/code-review-pipeline.context';
import { createLogger } from '@kodus/flow';
import {
    GithubChecksService,
    CheckStatus,
} from '@libs/platform/infrastructure/adapters/services/github/github-checks.service';
import { PlatformType } from '@libs/core/domain/enums';

@Injectable()
export class CreateGithubCheckStage extends BasePipelineStage<CodeReviewPipelineContext> {
    readonly stageName = 'CreateGithubCheckStage';
    private readonly logger = createLogger(CreateGithubCheckStage.name);

    constructor(private readonly githubChecksService: GithubChecksService) {
        super();
    }

    protected async executeStage(
        context: CodeReviewPipelineContext,
    ): Promise<CodeReviewPipelineContext> {
        if (context.platformType !== PlatformType.GITHUB) {
            this.logger.log({
                message: `Skipping GitHub Check creation for non-GitHub platform`,
                context: this.stageName,
                metadata: {
                    platformType: context.platformType,
                    organizationAndTeamData: context.organizationAndTeamData,
                },
            });
            return context;
        }

        if (!context.pullRequest?.head?.sha) {
            this.logger.warn({
                message: `Missing head SHA, cannot create GitHub Check`,
                context: this.stageName,
                metadata: {
                    prNumber: context.pullRequest?.number,
                    organizationAndTeamData: context.organizationAndTeamData,
                },
            });
            return context;
        }

        try {
            const [owner, repo] = context.repository.fullName?.split('/') || [];

            if (!owner || !repo) {
                this.logger.warn({
                    message: `Invalid repository fullName format`,
                    context: this.stageName,
                    metadata: {
                        fullName: context.repository.fullName,
                        organizationAndTeamData:
                            context.organizationAndTeamData,
                    },
                });
                return context;
            }

            const checkRunId = await this.githubChecksService.createCheckRun({
                organizationAndTeamData: context.organizationAndTeamData,
                repository: {
                    owner,
                    name: repo,
                },
                headSha: context.pullRequest.head.sha,
                status: CheckStatus.IN_PROGRESS,
            });

            if (checkRunId) {
                // Store the check run ID in context for later updates
                return this.updateContext(context, (draft) => {
                    draft.githubCheckRunId = checkRunId;
                });
            }
        } catch (error) {
            this.logger.error({
                message: `Error creating GitHub Check`,
                context: this.stageName,
                error,
                metadata: {
                    prNumber: context.pullRequest?.number,
                    organizationAndTeamData: context.organizationAndTeamData,
                },
            });
        }

        return context;
    }
}
