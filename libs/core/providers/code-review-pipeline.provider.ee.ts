/**
 * @license
 * Kodus Tech. All rights reserved.
 */
import { CodeReviewPipelineStrategy } from '@libs/code-review/pipeline/strategy/code-review-pipeline.strategy';
import { CodeReviewPipelineContext } from '@libs/code-review/pipeline/context/code-review-pipeline.context';
import { IPipeline } from '@libs/core/infrastructure/pipeline/interfaces/pipeline.interface';
import { PipelineExecutor } from '@libs/core/infrastructure/pipeline/services/pipeline-executor.service';

import { Provider } from '@nestjs/common';
import { CodeReviewPipelineStrategyEE } from '@libs/ee/codeReview/strategies/code-review-pipeline.strategy.ee';
import { createLogger } from '@kodus/flow';

export const CODE_REVIEW_PIPELINE_TOKEN = 'CODE_REVIEW_PIPELINE';

const logger = createLogger('codeReviewPipelineProvider');

export const codeReviewPipelineProvider: Provider = {
    provide: CODE_REVIEW_PIPELINE_TOKEN,
    useFactory: (
        _ceStrategy: CodeReviewPipelineStrategy,
        eeStrategy: CodeReviewPipelineStrategyEE,
    ): IPipeline<CodeReviewPipelineContext> => {
        const strategy = eeStrategy;

        logger.log({
            message: `🔁 Modo de execução: Cloud (EE) (Forced)`,
            context: 'CodeReviewPipelineProvider',
            metadata: {
                mode: 'cloud',
            },
        });

        return {
            pipeLineName: 'CodeReviewPipeline',
            execute: async (
                context: CodeReviewPipelineContext,
            ): Promise<CodeReviewPipelineContext> => {
                const stages = strategy.configureStages();
                const executor = new PipelineExecutor();
                return (await executor.execute(
                    context,
                    stages,
                    strategy.getPipelineName(),
                )) as CodeReviewPipelineContext;
            },
        };
    },
    inject: [CodeReviewPipelineStrategy, CodeReviewPipelineStrategyEE],
};
