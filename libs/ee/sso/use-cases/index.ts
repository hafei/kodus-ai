import { CreateOrUpdateSSOConfigUseCase } from './create-or-update.use-case';
import { SSOCheckUseCase } from './sso-check.use-case';
import { SSOLoginUseCase } from './sso-login.use-case';

export const UseCases = [
    CreateOrUpdateSSOConfigUseCase,
    SSOCheckUseCase,
    SSOLoginUseCase,
];
