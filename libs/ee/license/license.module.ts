/**
 * @license
 * Kodus Tech. All rights reserved.
 */

import { forwardRef, Module } from '@nestjs/common';

import { TeamModule } from '@libs/organization/modules/team.module';

import { LICENSE_SERVICE_TOKEN } from './interfaces/license.interface';
import { LicenseService } from './license.service';
import { AutoAssignLicenseUseCase } from './use-cases/auto-assign-license.use-case';
import { OrganizationParametersModule } from '@libs/organization/modules/organizationParameters.module';

@Module({
    imports: [
        forwardRef(() => TeamModule),
        forwardRef(() => OrganizationParametersModule),
    ],
    providers: [
        LicenseService,
        {
            provide: LICENSE_SERVICE_TOKEN,
            useExisting: LicenseService,
        },
        AutoAssignLicenseUseCase,
    ],
    exports: [LicenseService, LICENSE_SERVICE_TOKEN, AutoAssignLicenseUseCase],
})
export class LicenseModule {}
