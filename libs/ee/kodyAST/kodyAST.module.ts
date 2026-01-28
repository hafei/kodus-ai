import { Module, forwardRef } from '@nestjs/common';

import { environment } from '../configs/environment';
import { AST_ANALYSIS_SERVICE_TOKEN } from '@libs/code-review/domain/contracts/ASTAnalysisService.contract';
import { CodeAstAnalysisService } from './codeASTAnalysis.service';
import { AIEngineModule } from '@libs/ai-engine/modules/ai-engine.module';
import { PlatformModule } from '@libs/platform/modules/platform.module';
import { SharedObservabilityModule } from '@libs/shared/infrastructure/shared-observability.module';

const staticImports = [
    forwardRef(() => PlatformModule),
    forwardRef(() => AIEngineModule),
    SharedObservabilityModule,
];

const providers = [];
const moduleExports = [AST_ANALYSIS_SERVICE_TOKEN];

if (process.env.API_ENABLE_CODE_REVIEW_AST) {
    providers.push({
        provide: AST_ANALYSIS_SERVICE_TOKEN,
        useClass: CodeAstAnalysisService,
    });
} else {
    // Self-hosted mode, provide null services
    providers.push({ provide: AST_ANALYSIS_SERVICE_TOKEN, useValue: null });
}

@Module({
    imports: staticImports,
    providers,
    exports: moduleExports,
})
export class KodyASTModule { }
