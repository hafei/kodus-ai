import { Module, forwardRef } from '@nestjs/common';
import { PermissionsModule } from '@libs/identity/modules/permissions.module';
import { ParametersModule } from '@libs/organization/modules/parameters.module';
import { OrganizationParametersModule } from '@libs/organization/modules/organizationParameters.module';
import { CodebaseModule } from '@libs/code-review/modules/codebase.module';
import { PlatformModule } from '@libs/platform/modules/platform.module';
import { CodeReviewSettingsLogModule } from '@libs/ee/codeReviewSettingsLog/codeReviewSettingsLog.module';
import { KodyRulesModule } from '@libs/kodyRules/modules/kodyRules.module';
import { PromptsModule } from '@libs/code-review/modules/prompts.module';
import { ContextReferenceModule } from '@libs/code-review/modules/contextReference.module';
import { PullRequestMessagesModule } from '@libs/code-review/modules/pullRequestMessages.module';
import { IntegrationConfigModule } from '@libs/integrations/modules/config.module';
import { PlatformDataModule } from '@libs/platformData/platformData.module';

import { ApplyCodeReviewPresetUseCase } from '../application/use-cases/configuration/apply-code-review-preset.use-case';
import { DeleteRepositoryCodeReviewParameterUseCase } from '../application/use-cases/configuration/delete-repository-code-review-parameter.use-case';
import { GenerateKodusConfigFileUseCase } from '../application/use-cases/configuration/generate-kodus-config-file.use-case';
import { GetCodeReviewParameterUseCase } from '../application/use-cases/configuration/get-code-review-parameter.use-case';
import { ListCodeReviewAutomationLabelsUseCase } from '../application/use-cases/configuration/list-code-review-automation-labels-use-case';
import { ListCodeReviewAutomationLabelsWithStatusUseCase } from '../application/use-cases/configuration/list-code-review-automation-labels-with-status.use-case';
import { UpdateCodeReviewParameterRepositoriesUseCase } from '../application/use-cases/configuration/update-code-review-parameter-repositories-use-case';
import { UpdateOrCreateCodeReviewParameterUseCase } from '../application/use-cases/configuration/update-or-create-code-review-parameter-use-case';
import { PreviewPrSummaryUseCase } from '../application/use-cases/summary/preview-pr-summary.use-case'; // Added

@Module({
    imports: [
        PermissionsModule,
        forwardRef(() => ParametersModule),
        OrganizationParametersModule,
        forwardRef(() => CodebaseModule),
        forwardRef(() => PlatformModule),
        forwardRef(() => CodeReviewSettingsLogModule),
        forwardRef(() => KodyRulesModule),
        forwardRef(() => PromptsModule),
        forwardRef(() => ContextReferenceModule),
        forwardRef(() => PullRequestMessagesModule),
        forwardRef(() => IntegrationConfigModule),
        forwardRef(() => PlatformDataModule),
    ],
    providers: [
        ApplyCodeReviewPresetUseCase,
        DeleteRepositoryCodeReviewParameterUseCase,
        GenerateKodusConfigFileUseCase,
        GetCodeReviewParameterUseCase,
        ListCodeReviewAutomationLabelsUseCase,
        ListCodeReviewAutomationLabelsWithStatusUseCase,
        UpdateCodeReviewParameterRepositoriesUseCase,
        UpdateOrCreateCodeReviewParameterUseCase,
        PreviewPrSummaryUseCase, // Added
    ],
    exports: [
        ApplyCodeReviewPresetUseCase,
        DeleteRepositoryCodeReviewParameterUseCase,
        GenerateKodusConfigFileUseCase,
        GetCodeReviewParameterUseCase,
        ListCodeReviewAutomationLabelsUseCase,
        ListCodeReviewAutomationLabelsWithStatusUseCase,
        UpdateCodeReviewParameterRepositoriesUseCase,
        UpdateOrCreateCodeReviewParameterUseCase,
        PreviewPrSummaryUseCase, // Added
    ],
})
export class CodeReviewConfigurationModule {}
