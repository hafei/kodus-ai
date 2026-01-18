import { Inject, Injectable } from '@nestjs/common';

import { IUseCase } from '@libs/core/domain/interfaces/use-case.interface';
import { SSOProtocol } from '@libs/ee/sso/domain/interfaces/ssoConfig.interface';
import {
    ISSOConfigService,
    SSO_CONFIG_SERVICE_TOKEN,
} from '../domain/contracts/ssoConfig.service.contract';

@Injectable()
export class SSOCheckUseCase implements IUseCase {
    constructor(
        @Inject(SSO_CONFIG_SERVICE_TOKEN)
        private readonly ssoConfigService: ISSOConfigService,
    ) {}

    async execute(domain: string) {
        const ssoConfig = await this.ssoConfigService.findOne({
            protocol: SSOProtocol.SAML,
            domains: [domain],
        });

        if (!ssoConfig) {
            return {
                active: false,
                organizationId: null,
            };
        }

        return {
            active: ssoConfig.active,
            organizationId: ssoConfig.toJson().organization.uuid,
        };
    }
}
