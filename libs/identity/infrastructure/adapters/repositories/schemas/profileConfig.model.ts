import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { ProfileModel } from './profile.model';

import { CoreModel } from '@libs/core/infrastructure/repositories/model/typeOrm';
import { ProfileConfigKey } from '@libs/identity/domain/profile-configs/enum/profileConfigKey.enum';

@Entity('profile_configs')
export class ProfileConfigModel extends CoreModel {
    @Column({
        type: 'enum',
        enum: ProfileConfigKey,
    })
    configKey: ProfileConfigKey;

    @Column({ type: 'jsonb' })
    configValue: any;

    @Column({ default: true })
    public status: boolean;

    @ManyToOne('ProfileModel', 'profileConfigs')
    @JoinColumn({ name: 'profile_id', referencedColumnName: 'uuid' })
    profile: ProfileModel;
}
