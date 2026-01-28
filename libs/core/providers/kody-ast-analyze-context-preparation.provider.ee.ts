/**
 * @license
 * Kodus Tech. All rights reserved.
 */

import { Provider } from '@nestjs/common';
import {
    IKodyASTAnalyzeContextPreparationService,
    KODY_AST_ANALYZE_CONTEXT_PREPARATION_TOKEN,
} from '../domain/interfaces/kody-ast-analyze-context-preparation.interface';
import { KodyASTAnalyzeContextPreparationService } from '@libs/code-review/infrastructure/adapters/services/code-analysis/ast/noop-ast-analyze.service';
import { CodeAnalysisOrchestrator } from '@libs/ee/codeBase/codeAnalysisOrchestrator.service';

import { KodyASTAnalyzeContextPreparationServiceEE } from '@libs/ee/kodyASTAnalyze/kody-ast-analyze-context-preparation.ts';

export const KODY_AST_ANALYZE_CONTEXT_PREPARATION_PROVIDER: Provider = {
    provide: KODY_AST_ANALYZE_CONTEXT_PREPARATION_TOKEN,
    useFactory: (
        _corePreparation: KodyASTAnalyzeContextPreparationService,
        codeAnalysisOrchestrator: CodeAnalysisOrchestrator,
    ): IKodyASTAnalyzeContextPreparationService => {
        return new KodyASTAnalyzeContextPreparationServiceEE(
            codeAnalysisOrchestrator,
        );
    },
    inject: [KodyASTAnalyzeContextPreparationService, CodeAnalysisOrchestrator],
};
