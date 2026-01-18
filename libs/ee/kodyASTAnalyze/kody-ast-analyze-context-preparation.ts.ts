/**
 * @license
 * Kodus Tech. All rights reserved.
 */

import { BaseKodyASTAnalyzeContextPreparation } from '@libs/code-review/infrastructure/adapters/services/code-analysis/ast/base-ast-analyze.abstract';
import {
    AIAnalysisResult,
    AnalysisContext,
} from '@libs/core/infrastructure/config/types/general/codeReview.type';
import { createLogger } from '@kodus/flow';
import { Injectable } from '@nestjs/common';
import { CodeAnalysisOrchestrator } from '../codeBase/codeAnalysisOrchestrator.service';

/**
 * Enterprise implementation of AST analysis service
 * Extends the base class and adds advanced functionality
 * Available only in the cloud version or with an enterprise license
 */
@Injectable()
export class KodyASTAnalyzeContextPreparationServiceEE extends BaseKodyASTAnalyzeContextPreparation {
    protected readonly logger = createLogger(
        KodyASTAnalyzeContextPreparationServiceEE.name,
    );
    constructor(
        private readonly codeAnalysisOrchestrator: CodeAnalysisOrchestrator,
    ) {
        super();
    }

    /**
     * Performs advanced AST analysis
     * @param organizationId Organization identifier
     * @param prNumber Pull Request number
     * @param repository Repository information
     * @param files Files to analyze
     * @param clusterizedSuggestions Clusterized suggestions
     * @param isAstAnalysisEnabled Whether AST analysis is enabled
     * @returns Array of analyzed files
     * @override
     */
    async prepareKodyASTAnalyzeContextInternal(
        context: AnalysisContext,
    ): Promise<AIAnalysisResult | null> {
        return null;
    }
}
