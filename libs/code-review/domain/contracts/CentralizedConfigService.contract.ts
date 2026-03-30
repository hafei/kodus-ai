import { KodusConfigFile } from '@libs/core/infrastructure/config/types/general/codeReview.type';
import { OrganizationAndTeamData } from '@libs/core/infrastructure/config/types/general/organizationAndTeamData';

export const CENTRALIZED_CONFIG_SERVICE_TOKEN =
    'CENTRALIZED_CONFIG_SERVICE_TOKEN';

export interface IConfigFileMeta {
    centralizedDirectoryPath?: string;
    repositoryId?: string;
    directoryPath?: string;
}

export interface ICentralizedConfigService {
    /**
     * Validates if centralized config is enabled and properly configured for the team
     */
    validateCentralizedConfig(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository?: { name: string; id: string };
    }): Promise<{
        success: boolean;
        message: string;
    }>;

    /**
     * Gets the centralized config repository configuration
     */
    getCentralizedConfigRepository(
        organizationAndTeamData: OrganizationAndTeamData,
    ): Promise<{ name: string; id: string }>;

    /**
     * Discovers all kodus-config.yml files in the centralized config repository
     */
    discoverConfigFiles(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
    }): Promise<IConfigFileMeta[]>;

    /**
     * Fetches a specific config file from the repository
     */
    fetchConfigFile(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        repository: { name: string; id: string };
        dir?: string;
    }): Promise<KodusConfigFile | null>;

    /**
     * Synchronizes config files by updating parameters based on discovered files
     */
    synchronizeConfigs(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        configFiles: IConfigFileMeta[];
        actor: {
            organizationId: string;
            source: string;
            userEmail: string;
            userId: string;
        };
    }): Promise<{
        success: boolean;
        message: string;
    }>;

    /**
     * Removes stale configs that are no longer present in the repository
     */
    removeStaleConfigs(params: {
        organizationAndTeamData: OrganizationAndTeamData;
        configFiles: IConfigFileMeta[];
        actor: {
            organizationId: string;
            source: string;
            userEmail: string;
            userId: string;
        };
    }): Promise<{
        success: boolean;
        message: string;
    }>;
}
