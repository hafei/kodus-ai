export const AuditLogEvents = {
    CODE_REVIEW_CONFIG: 'audit.codeReviewConfig',
    KODY_RULES: 'audit.kodyRules',
    REPOSITORIES: 'audit.repositories',
    REPOSITORY_CONFIG_REMOVAL: 'audit.repositoryConfigRemoval',
    DIRECTORY_CONFIG_REMOVAL: 'audit.directoryConfigRemoval',
    INTEGRATION: 'audit.integration',
    USER_STATUS: 'audit.userStatus',
    PR_MESSAGES: 'audit.pullRequestMessages',
} as const;
