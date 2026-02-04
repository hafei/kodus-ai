import {
    COMMENT_MANAGER_SERVICE_TOKEN,
    ICommentManagerService,
} from '@libs/code-review/domain/contracts/CommentManagerService.contract';
import { ParametersKey } from '@libs/core/domain/enums';
import {
    CommentResult,
    SummaryConfig,
} from '@libs/core/infrastructure/config/types/general/codeReview.type';
import {
    IParametersService,
    PARAMETERS_SERVICE_TOKEN,
} from '@libs/organization/domain/parameters/contracts/parameters.service.contract';
import { PreviewPrSummaryDto } from '@libs/organization/dtos/preview-pr-summary.dto';
import { CodeManagementService } from '@libs/platform/infrastructure/adapters/services/codeManagement.service';
import {
    IPullRequestsService,
    PULL_REQUESTS_SERVICE_TOKEN,
} from '@libs/platformData/domain/pullRequests/contracts/pullRequests.service.contracts';
import { PriorityStatus } from '@libs/platformData/domain/pullRequests/enums/priorityStatus.enum';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class PreviewPrSummaryUseCase {
    constructor(
        @Inject(COMMENT_MANAGER_SERVICE_TOKEN)
        private readonly commentManagerService: ICommentManagerService,

        @Inject(PARAMETERS_SERVICE_TOKEN)
        private readonly parametersService: IParametersService,

        private readonly codeManagementService: CodeManagementService,

        @Inject(PULL_REQUESTS_SERVICE_TOKEN)
        private readonly pullRequestsService: IPullRequestsService,
    ) { }

    async execute(body: PreviewPrSummaryDto & { organizationId: string }) {
        const {
            prNumber,
            repository,
            organizationId,
            teamId,
            behaviourForExistingDescription,
            customInstructions,
        } = body;

        const organizationAndTeamData = {
            organizationId,
            teamId,
        };

        const pullRequest =
            await this.codeManagementService.getPullRequestByNumber({
                organizationAndTeamData,
                repository,
                prNumber: Number(prNumber),
            });

        if (!pullRequest) {
            throw new NotFoundException('Pull request not found');
        }

        const prFiles =
            await this.codeManagementService.getFilesByPullRequestId({
                organizationAndTeamData,
                repository,
                prNumber: Number(prNumber),
            });

        if (!prFiles?.length) {
            throw new NotFoundException('Pull request not found');
        }

        const files = prFiles.map((file) => ({
            filename: file.filename,
            patch: file.patch,
            status: file.status,
        }));

        const languageResultPrompt = await this.parametersService.findByKey(
            ParametersKey.LANGUAGE_CONFIG,
            organizationAndTeamData,
        );

        const summaryConfig: SummaryConfig = {
            behaviourForExistingDescription: behaviourForExistingDescription,
            customInstructions: customInstructions,
            generatePRSummary: true,
        };

        const storedPullRequest =
            await this.pullRequestsService.findByNumberAndRepositoryId(
                Number(prNumber),
                repository.id,
                organizationAndTeamData,
            );

        const storedSuggestions =
            storedPullRequest
                ?.toObject()
                ?.files?.flatMap((file) => file.suggestions || []) || [];

        const commentResults: CommentResult[] = storedSuggestions
            .filter((suggestion) =>
                [
                    PriorityStatus.PRIORITIZED,
                    PriorityStatus.PRIORITIZED_BY_CLUSTERING,
                ].includes(suggestion.priorityStatus),
            )
            .filter((suggestion) => Boolean(suggestion?.relevantFile))
            .map((suggestion) => ({
                comment: {
                    path: suggestion.relevantFile,
                    line:
                        suggestion.relevantLinesEnd ??
                        suggestion.relevantLinesStart,
                    body: '',
                    suggestion: suggestion as any,
                },
                deliveryStatus: suggestion.deliveryStatus,
                codeSuggestion: suggestion as any,
            }));

        const prSummary = await this.commentManagerService.generateSummaryPR(
            pullRequest,
            repository,
            files,
            organizationAndTeamData,
            languageResultPrompt?.configValue ?? 'en-US',
            summaryConfig,
            null,
            false,
            true,
            undefined,
            commentResults,
        );

        return prSummary;
    }
}
