import { AuthModule } from '@libs/identity/modules/auth.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SSO_CONFIG_REPOSITORY_TOKEN } from './domain/contracts/ssoConfig.repository.contract';
import { SSO_CONFIG_SERVICE_TOKEN } from './domain/contracts/ssoConfig.service.contract';
import { SSOConfigModel } from './repositories/ssoConfig.model';
import { SSOConfigRepository } from './repositories/ssoConfig.repository';
import { SSOConfigService } from './services/ssoConfig.service';
import { SamlStrategy } from './strategies/saml-auth.strategy';
import { UseCases } from './use-cases';

@Module({
    imports: [TypeOrmModule.forFeature([SSOConfigModel]), AuthModule],
    providers: [
        SamlStrategy,
        ...UseCases,
        {
            provide: SSO_CONFIG_REPOSITORY_TOKEN,
            useClass: SSOConfigRepository,
        },
        {
            provide: SSO_CONFIG_SERVICE_TOKEN,
            useClass: SSOConfigService,
        },
    ],
    exports: [...UseCases, SSO_CONFIG_SERVICE_TOKEN],
})
export class SSOModule {}
