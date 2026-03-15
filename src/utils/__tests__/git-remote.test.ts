import { describe, expect, it } from 'vitest';
import {
    extractOrgRepoFromRemote,
    inferPlatformFromRemote,
} from '../git-remote.js';

describe('inferPlatformFromRemote', () => {
    it('detects GitHub from HTTPS URL', () => {
        expect(
            inferPlatformFromRemote('https://github.com/org/repo.git'),
        ).toBe('GITHUB');
    });

    it('detects Azure DevOps from visualstudio.com URL', () => {
        expect(
            inferPlatformFromRemote(
                'https://org.visualstudio.com/project/_git/repo',
            ),
        ).toBe('AZURE_REPOS');
    });

    it('returns undefined for deceptive subdomain hosts', () => {
        expect(
            inferPlatformFromRemote(
                'https://github.com.evil.example.com/org/repo.git',
            ),
        ).toBeUndefined();
    });
});

describe('extractOrgRepoFromRemote', () => {
    it('extracts owner and repo from GitHub SSH URL', () => {
        expect(extractOrgRepoFromRemote('git@github.com:org/repo.git')).toEqual(
            {
                org: 'org',
                repo: 'repo',
            },
        );
    });

    it('extracts owner and repo from GitLab HTTPS URL', () => {
        expect(
            extractOrgRepoFromRemote('https://gitlab.com/group/project.git'),
        ).toEqual({
            org: 'group',
            repo: 'project',
        });
    });

    it('returns null for unsupported remotes', () => {
        expect(
            extractOrgRepoFromRemote(
                'https://selfhosted.example.com/org/repo.git',
            ),
        ).toBeNull();
    });
});
