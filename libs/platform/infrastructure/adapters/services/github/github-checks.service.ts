import { Injectable } from '@nestjs/common';
import { createLogger } from '@kodus/flow';
import { OrganizationAndTeamData } from '@libs/core/infrastructure/config/types/general/organizationAndTeamData';
import { GithubService } from './github.service';

export enum CheckStatus {
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
}

export interface CreateCheckRunParams {
    organizationAndTeamData: OrganizationAndTeamData;
    repository: {
        owner: string;
        name: string;
    };
    headSha: string;
    status: CheckStatus;
    name?: string;
}

export interface UpdateCheckRunParams {
    organizationAndTeamData: OrganizationAndTeamData;
    repository: {
        owner: string;
        name: string;
    };
    checkRunId: number;
    status?: CheckStatus;
    output?: {
        title: string;
        summary: string;
        text?: string;
    };
}

@Injectable()
export class GithubChecksService {
    private readonly logger = createLogger(GithubChecksService.name);

    constructor(private readonly gitHubService: GithubService) {}

    async createCheckRun(params: CreateCheckRunParams): Promise<number | null> {
        const {
            organizationAndTeamData,
            repository,
            headSha,
            name = 'Kody',
        } = params;

        try {
            const octokit = await this.gitHubService.getAuthenticatedOctokit(
                organizationAndTeamData,
            );

            const response = await octokit.checks.create({
                owner: repository.owner,
                repo: repository.name,
                name,
                head_sha: headSha,
                status: CheckStatus.IN_PROGRESS,
                // conclusion: CheckConclusion.SUCCESS,
                started_at: new Date().toISOString(),
                output: {
                    title: 'Code Review Starting',
                    summary: 'Kody is analyzing your code changes...',
                },
            });

            this.logger.log({
                message: `Created GitHub Check Run`,
                context: GithubChecksService.name,
                metadata: {
                    checkRunId: response.data.id,
                    repository: repository.name,
                    headSha,
                },
            });

            return response.data.id;
        } catch (error) {
            this.logger.error({
                message: `Failed to create GitHub Check Run`,
                context: GithubChecksService.name,
                error,
                metadata: {
                    repository: repository.name,
                    headSha,
                },
            });
            return null;
        }
    }

    private async updateCheckRun(
        params: UpdateCheckRunParams,
    ): Promise<boolean> {
        const {
            organizationAndTeamData,
            repository,
            checkRunId,
            status,
            output,
        } = params;

        try {
            const octokit = await this.gitHubService.getAuthenticatedOctokit(
                organizationAndTeamData,
            );

            const updateData: any = {
                owner: repository.owner,
                repo: repository.name,
                check_run_id: checkRunId,
            };

            if (status) {
                updateData.status = status;
            }
            if (status === CheckStatus.COMPLETED) {
                updateData.conclusion = 'success';
            }

            if (output) {
                updateData.output = output;
            }

            await octokit.checks.update(updateData);

            this.logger.log({
                message: `Updated GitHub Check Run`,
                context: GithubChecksService.name,
                metadata: {
                    checkRunId,
                    repository: repository.name,
                    status,
                    organizationAndTeamData,
                },
            });

            return true;
        } catch (error) {
            this.logger.error({
                message: `Failed to update GitHub Check Run`,
                context: GithubChecksService.name,
                error,
                metadata: {
                    checkRunId,
                    repository: repository.name,
                    organizationAndTeamData,
                },
            });
            return false;
        }
    }

    /**
     * Marks a check as completed successfully
     */
    async markSuccess(params: UpdateCheckRunParams): Promise<boolean> {
        return this.updateCheckRun({
            ...params,
            status: CheckStatus.COMPLETED,
            output: params.output || {
                title: 'Code Review Complete',
                summary:
                    'Kody has finished analyzing your code. Check the comments for feedback.',
            },
        });
    }

    /**
     * Marks a check as failed
     */
    async markFailure(params: UpdateCheckRunParams): Promise<boolean> {
        return this.updateCheckRun({
            ...params,
            status: CheckStatus.COMPLETED,
            output: params.output || {
                title: 'Code Review Failed',
                summary:
                    'An error occurred during code review. Please check the logs.',
            },
        });
    }
}
