import { Inject, Injectable } from '@nestjs/common';
import {
    ISSOConfigRepository,
    SSO_CONFIG_REPOSITORY_TOKEN,
} from '../domain/contracts/ssoConfig.repository.contract';
import { ISSOConfigService } from '../domain/contracts/ssoConfig.service.contract';
import { SSOConfigEntity } from '../domain/entities/ssoConfig.entity';
import {
    SSOConfig,
    SSOProtocol,
} from '../domain/interfaces/ssoConfig.interface';

@Injectable()
export class SSOConfigService implements ISSOConfigService {
    constructor(
        @Inject(SSO_CONFIG_REPOSITORY_TOKEN)
        private readonly ssoRepository: ISSOConfigRepository,
    ) {}

    create<P extends SSOProtocol>(
        sso: Omit<SSOConfig<P>, 'uuid' | 'createdAt' | 'updatedAt'>,
    ): Promise<SSOConfigEntity<P>> {
        return this.ssoRepository.create(sso);
    }

    update<P extends SSOProtocol>(
        uuid: string,
        sso: Partial<Omit<SSOConfig<P>, 'uuid' | 'createdAt' | 'updatedAt'>>,
    ): Promise<SSOConfigEntity<P>> {
        return this.ssoRepository.update(uuid, sso);
    }

    delete(uuid: string): Promise<void> {
        return this.ssoRepository.delete(uuid);
    }

    find<P extends SSOProtocol>(
        sso: Partial<SSOConfig<P>>,
    ): Promise<SSOConfigEntity<P>[]> {
        return this.ssoRepository.find(sso);
    }

    findOne<P extends SSOProtocol>(
        sso: Partial<SSOConfig<P>>,
    ): Promise<SSOConfigEntity<P> | null> {
        return this.ssoRepository.findOne(sso);
    }
}
