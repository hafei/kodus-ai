import type { PlatformType } from '../types/cli.js';

export function extractOrgRepoFromRemote(
    remoteUrl: string | null | undefined,
): { org: string; repo: string } | null {
    if (!remoteUrl) {
        return null;
    }

    const patterns = [
        /github\.com[:/]([^/]+)\/([^/.]+)/,
        /gitlab\.com[:/]([^/]+)\/([^/.]+)/,
        /bitbucket\.org[:/]([^/]+)\/([^/.]+)/,
    ];

    for (const pattern of patterns) {
        const match = remoteUrl.match(pattern);
        if (match) {
            return { org: match[1], repo: match[2] };
        }
    }

    return null;
}

export function inferPlatformFromRemote(
    remote: string | null | undefined,
): PlatformType {
    if (!remote) {
        return undefined;
    }

    const host = extractRemoteHost(remote);
    if (!host) {
        return undefined;
    }

    if (host === 'github.com') {
        return 'GITHUB';
    }
    if (host === 'gitlab.com') {
        return 'GITLAB';
    }
    if (host === 'bitbucket.org') {
        return 'BITBUCKET';
    }
    if (
        host === 'dev.azure.com' ||
        host === 'ssh.dev.azure.com' ||
        host === 'visualstudio.com' ||
        host.endsWith('.visualstudio.com')
    ) {
        return 'AZURE_REPOS';
    }

    return undefined;
}

function extractRemoteHost(remote: string): string | undefined {
    const value = remote.trim().toLowerCase();
    if (!value) {
        return undefined;
    }

    try {
        const url = new URL(value);
        if (url.hostname) {
            return url.hostname.toLowerCase();
        }
    } catch {
        // Fallback below for SCP-like syntax.
    }

    const scpLike = value.match(/^(?:[^@/]+@)?([^:/]+):.+$/);
    return scpLike?.[1];
}
