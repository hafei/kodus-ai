import { PlatformType } from '@libs/core/domain/enums';
import { RemoteCommands } from '../../infrastructure/adapters/services/collectCrossFileContexts.service';

export interface CreateSandboxParams {
    cloneUrl: string;
    authToken: string;
    branch: string;
    platform: PlatformType;
    /** Platform username for auth (required by Bitbucket App Passwords) */
    authUsername?: string;
    prNumber?: number;
    /** Base branch of the PR (e.g. "main", "develop"). Used to fetch the base ref so git diff works in the sandbox. */
    baseBranch?: string;
}

export interface SandboxInstance {
    remoteCommands: RemoteCommands;
    cleanup: () => Promise<void>;
    /** Which sandbox provider created this instance */
    type: 'e2b' | 'local' | 'null';
    /** Base branch fetched in the sandbox (e.g. "main"). Allows tools to run git diff origin/${baseBranch}...HEAD */
    baseBranch?: string;
}

export interface ISandboxProvider {
    /** Whether this provider is configured and ready to use */
    isAvailable(): boolean;

    /** Create a sandbox with the repo cloned and ready */
    createSandboxWithRepo(
        params: CreateSandboxParams,
    ): Promise<SandboxInstance>;
}

export const SANDBOX_PROVIDER_TOKEN = Symbol('SANDBOX_PROVIDER_TOKEN');
