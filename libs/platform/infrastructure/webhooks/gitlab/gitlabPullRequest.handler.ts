import { createLogger } from '@kodus/flow';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PlatformType } from '@libs/core/domain/enums/platform-type.enum';
import { GenerateIssuesFromPrClosedUseCase } from '@libs/issues/application/use-cases/generate-issues-from-pr-closed.use-case';
import { ChatWithKodyFromGitUseCase } from '@libs/platform/application/use-cases/codeManagement/chatWithKodyFromGit.use-case';
import {
    IWebhookEventHandler,
    IWebhookEventParams,
} from '@libs/platform/domain/platformIntegrations/interfaces/webhook-event-handler.interface';
import { CodeManagementService } from '../../adapters/services/codeManagement.service';
import { getMappedPlatform } from '@libs/common/utils/webhooks';
import { RunCodeReviewAutomationUseCase } from '@libs/ee/automation/runCodeReview.use-case';
import { SavePullRequestUseCase } from '@libs/platformData/application/use-cases/pullRequests/save.use-case';
import { PullRequestClosedEvent } from '@libs/core/domain/events/pull-request-closed.event';
import { EnqueueCodeReviewJobUseCase } from '@libs/core/workflow/application/use-cases/enqueue-code-review-job.use-case';
import { EnqueueImplementationCheckUseCase } from '@libs/code-review/application/use-cases/enqueue-implementation-check.use-case';

/**
 * Handler for GitLab webhook events.
 * Processes both merge request and comment events.
 */
@Injectable()
export class GitLabMergeRequestHandler implements IWebhookEventHandler {
    private readonly logger = createLogger(GitLabMergeRequestHandler.name);
    constructor(
        private readonly savePullRequestUseCase: SavePullRequestUseCase,
        private readonly runCodeReviewAutomationUseCase: RunCodeReviewAutomationUseCase,
        private readonly chatWithKodyFromGitUseCase: ChatWithKodyFromGitUseCase,
        private readonly generateIssuesFromPrClosedUseCase: GenerateIssuesFromPrClosedUseCase,
        private readonly eventEmitter: EventEmitter2,
        private readonly codeManagement: CodeManagementService,
        private readonly enqueueCodeReviewJobUseCase: EnqueueCodeReviewJobUseCase,
        private readonly enqueueImplementationCheckUseCase: EnqueueImplementationCheckUseCase,
    ) {}

    /**
     * Checks if this handler can process the given webhook event.
     * @param params The webhook event parameters.
     * @returns True if this handler can process the event, false otherwise.
     */
    public canHandle(params: IWebhookEventParams): boolean {
        console.log('params1111', params);
        return (
            params.platformType === PlatformType.GITLAB &&
            ['Merge Request Hook', 'Note Hook'].includes(params.event)
        );
    }

    /**
     * Processes GitLab webhook events.
     * @param params The webhook event parameters.
     */
    public async execute(params: IWebhookEventParams): Promise<void> {
        const { event } = params;

        // Direct to the appropriate method based on the event type
        switch (event) {
            case 'Merge Request Hook':
                await this.handleMergeRequest(params);
                break;
            case 'Note Hook':
                await this.handleComment(params);
                break;
            default:
                this.logger.warn({
                    message: `Unsupported GitLab event: ${event}`,
                    context: GitLabMergeRequestHandler.name,
                });
        }
    }

    private async handleMergeRequest(
        params: IWebhookEventParams,
    ): Promise<void> {
        const { payload } = params;
        const mrNumber = payload?.object_attributes?.iid;
        const mrUrl = payload?.object_attributes?.url;

        this.logger.log({
            context: GitLabMergeRequestHandler.name,
            serviceName: GitLabMergeRequestHandler.name,
            message: `Processing GitLab 'Merge Request Hook' event for MR #${mrNumber} (${mrUrl || 'URL not found'})`,
            metadata: { mrNumber, mrUrl },
        });

        const repository = {
            id: String(payload?.project?.id),
            name: payload?.project?.path,
            fullName: payload?.project?.path_with_namespace,
        } as any;

        const mappedPlatform = getMappedPlatform(PlatformType.GITLAB);
        if (!mappedPlatform) {
            this.logger.error({
                message: 'Could not get mapped platform for GitLab.',
                serviceName: GitLabMergeRequestHandler.name,
                metadata: { mrNumber },
                context: GitLabMergeRequestHandler.name,
            });
            return;
        }

        const mappedUsers = mappedPlatform.mapUsers({
            payload: payload,
        });

        const orgData =
            await this.runCodeReviewAutomationUseCase.findTeamWithActiveCodeReview(
                {
                    repository: {
                        id: String(payload?.project?.id),
                        name: payload?.project?.path,
                    },
                    platformType: PlatformType.GITLAB,
                    userGitId: mappedUsers?.user?.id?.toString(),
                    triggerCommentId: payload.comment?.id,
                },
            );

        try {
            // Check if we should trigger code review based on the MR action
            if (this.shouldTriggerCodeReviewForGitLab(payload)) {
                await this.savePullRequestUseCase.execute(params);

                if (
                    this.enqueueCodeReviewJobUseCase &&
                    orgData?.organizationAndTeamData
                ) {
                    this.enqueueCodeReviewJobUseCase
                        .execute({
                            payload,
                            event: params.event,
                            platformType: PlatformType.GITLAB,
                            organizationAndTeam:
                                orgData.organizationAndTeamData,
                            correlationId: params.correlationId,
                        })
                        .then((jobId) => {
                            this.logger.log({
                                message:
                                    'Code review job enqueued for asynchronous processing',
                                context: GitLabMergeRequestHandler.name,
                                metadata: {
                                    jobId,
                                    mrNumber,
                                    repositoryId: repository.id,
                                },
                            });
                        })
                        .catch((error) => {
                            this.logger.error({
                                message: 'Failed to enqueue code review job',
                                context: GitLabMergeRequestHandler.name,
                                error,
                                metadata: {
                                    mrNumber,
                                    repositoryId: repository.id,
                                },
                            });
                        });
                } else {
                    this.logger.log({
                        message:
                            'Skipping code review job enqueue (missing org/team or enqueue use case)',
                        context: GitLabMergeRequestHandler.name,
                        metadata: {
                            hasOrgAndTeam: !!orgData?.organizationAndTeamData,
                            mrNumber,
                            repositoryId: repository.id,
                        },
                    });
                }

                if (payload?.object_attributes?.action === 'merge') {
                    this.generateIssuesFromPrClosedUseCase.execute(params);

                    // Sync Kody Rules after merge into target branch

                    try {
                        if (orgData?.organizationAndTeamData) {
                            const baseRef =
                                payload?.object_attributes?.target_branch;
                            const defaultBranch =
                                await this.codeManagement.getDefaultBranch({
                                    organizationAndTeamData:
                                        orgData.organizationAndTeamData,
                                    repository: {
                                        id: repository.id,
                                        name: repository.name,
                                    },
                                });
                            if (baseRef !== defaultBranch) {
                                return;
                            }
                            const changedFiles =
                                await this.codeManagement.getFilesByPullRequestId(
                                    {
                                        organizationAndTeamData:
                                            orgData.organizationAndTeamData,
                                        repository: {
                                            id: repository.id,
                                            name: repository.name,
                                        },
                                        prNumber:
                                            payload?.object_attributes?.iid,
                                    },
                                );
                            this.eventEmitter.emit(
                                'pull-request.closed',
                                new PullRequestClosedEvent(
                                    orgData.organizationAndTeamData,
                                    repository,
                                    payload?.object_attributes?.iid,
                                    changedFiles || [],
                                ),
                            );
                        }
                    } catch (e) {
                        this.logger.error({
                            message: 'Failed to sync Kody Rules after MR merge',
                            context: GitLabMergeRequestHandler.name,
                            error: e,
                        });
                    }
                }

                return;
            } else if (
                payload?.object_attributes?.action === 'close' ||
                payload?.object_attributes?.action === 'merge' ||
                payload?.object_attributes?.action === 'update'
            ) {
                // For closed or merged MRs, just save the state without triggering automation
                await this.savePullRequestUseCase.execute(params);

                if (payload?.object_attributes?.action === 'update') {
                    if (orgData?.organizationAndTeamData) {
                        this.enqueueImplementationCheckUseCase
                            .execute({
                                organizationAndTeamData:
                                    orgData.organizationAndTeamData,
                                repository: {
                                    id: repository.id,
                                    name: repository.name,
                                },
                                pullRequestNumber:
                                    payload?.object_attributes?.iid,
                                commitSha:
                                    payload?.object_attributes?.last_commit?.id,
                                trigger: 'synchronize',
                            })
                            .catch((e) => {
                                this.logger.error({
                                    message:
                                        'Failed to enqueue implementation check',
                                    context: GitLabMergeRequestHandler.name,
                                    error: e,
                                    metadata: {
                                        repository,
                                        pullRequestNumber:
                                            payload?.object_attributes?.iid,
                                    },
                                });
                            });
                    }
                }

                if (payload?.object_attributes?.action === 'merge') {
                    this.generateIssuesFromPrClosedUseCase
                        .execute(params)
                        .catch((error) => {
                            this.logger.error({
                                message:
                                    'Failed to generate issues from merged MR',
                                context: GitLabMergeRequestHandler.name,
                                error,
                                metadata: {
                                    mrNumber,
                                    repositoryId: repository.id,
                                },
                            });
                        });
                }

                return;
            }
        } catch (error) {
            this.logger.error({
                context: GitLabMergeRequestHandler.name,
                serviceName: GitLabMergeRequestHandler.name,
                metadata: {
                    mrNumber,
                    mrUrl,
                    organizationAndTeamData: orgData?.organizationAndTeamData,
                },
                message: `Error processing GitLab merge request #${mrNumber}: ${error.message}`,
                error,
            });
            throw error;
        }
    }

    /**
     * Processes GitLab comment events
     */
    private async handleComment(params: IWebhookEventParams): Promise<void> {
        const { payload } = params;
        const mrNumber = payload?.object_attributes?.iid;

        const mappedPlatform = getMappedPlatform(PlatformType.GITLAB);
        if (!mappedPlatform) {
            this.logger.error({
                message: 'Could not get mapped platform for GitLab.',
                serviceName: GitLabMergeRequestHandler.name,
                metadata: { mrNumber },
                context: GitLabMergeRequestHandler.name,
            });
            return;
        }

        const mappedUsers = mappedPlatform.mapUsers({
            payload: payload,
        });

        const orgData =
            await this.runCodeReviewAutomationUseCase.findTeamWithActiveCodeReview(
                {
                    repository: {
                        id: String(payload?.project?.id),
                        name: payload?.project?.path,
                    },
                    platformType: PlatformType.GITLAB,
                    userGitId: mappedUsers?.user?.id?.toString(),
                    triggerCommentId: payload.comment?.id,
                },
            );

        try {
            // Verify if the action is create
            if (payload?.object_attributes?.action === 'create') {
                // Extract comment data

                const comment = mappedPlatform.mapComment({ payload });
                if (!comment || !comment.body) {
                    this.logger.debug({
                        message: 'Comment body empty, skipping.',
                        serviceName: GitLabMergeRequestHandler.name,
                        metadata: { mrNumber },
                        context: GitLabMergeRequestHandler.name,
                    });
                    return;
                }

                // Verify if it is a start-review command
                const commandPattern = /^\s*@kody\s+start-review/i;
                const isStartCommand = commandPattern.test(comment.body);

                // Verify if it has the review marker
                const reviewMarkerPattern = /<!--\s*kody-codereview\s*-->/i;
                const hasReviewMarker = reviewMarkerPattern.test(comment.body);

                // Verify if the comment mentions Kody and is not a start-review command
                const kodyMentionPattern = /^\s*@kody\b(?!\s+start-review)/i;

                if (isStartCommand && !hasReviewMarker) {
                    this.logger.log({
                        message: `@kody start command detected in GitLab comment for PR#${mrNumber}`,
                        serviceName: GitLabMergeRequestHandler.name,
                        metadata: { mrNumber },
                        context: GitLabMergeRequestHandler.name,
                    });

                    // Prepare params for use cases
                    const updatedParams = {
                        ...params,
                        payload: {
                            ...payload,
                            action: 'synchronize',
                            origin: 'command',
                            triggerCommentId: comment?.id,
                        },
                    };

                    await this.savePullRequestUseCase.execute(updatedParams);
                    if (orgData?.organizationAndTeamData) {
                        await this.enqueueCodeReviewJobUseCase.execute({
                            payload: updatedParams.payload,
                            event: updatedParams.event,
                            platformType: PlatformType.GITLAB,
                            organizationAndTeam:
                                orgData.organizationAndTeamData,
                            correlationId: params.correlationId,
                        });
                    }
                    return;
                }

                if (
                    !isStartCommand &&
                    !hasReviewMarker &&
                    kodyMentionPattern.test(comment.body)
                ) {
                    this.chatWithKodyFromGitUseCase.execute(params);
                    return;
                }
            }
        } catch (error) {
            this.logger.error({
                context: GitLabMergeRequestHandler.name,
                serviceName: GitLabMergeRequestHandler.name,
                metadata: { mrNumber },
                message: `Error processing GitLab comment: ${error.message}`,
                error,
            });
            throw error;
        }
    }

    private shouldTriggerCodeReviewForGitLab(params: any): boolean {
        const objectAttributes = params?.object_attributes || {};
        const changes = params?.changes || {};

        // Verify if it's a new MR
        if (objectAttributes.action === 'open') {
            return true;
        }

        // Verify if it's a new commit
        const lastCommitId = objectAttributes.last_commit?.id;
        const oldRev = objectAttributes.oldrev;

        if (lastCommitId && oldRev && lastCommitId !== oldRev) {
            return true;
        }

        // Verify if it's a merge
        if (
            objectAttributes.state === 'merged' ||
            objectAttributes.action === 'merge'
        ) {
            return true;
        }

        // Verify if the PR is closed.
        if (
            objectAttributes.state === 'closed' ||
            objectAttributes.action === 'close'
        ) {
            return true;
        }

        // Ignore if it's an update to the description
        if (objectAttributes.action === 'update' && changes.description) {
            return false;
        }

        if (
            objectAttributes.action === 'update' &&
            changes?.draft &&
            changes.draft.previous === true &&
            changes.draft.current === false
        ) {
            return true;
        }

        // For all other cases, return false
        return false;
    }
}
