export const CLI_KEY_CAPABILITIES = {
    CONFIG_REPO_MANAGE: "config:repo:manage",
} as const;

export type CLIKeyConfig = {
    capabilities?: string[];
};

export type CLIKey = {
    uuid: string;
    name: string;
    active: boolean;
    config?: CLIKeyConfig | null;
    lastUsedAt?: string | null;
    createdAt: string;
    createdBy: {
        uuid: string;
        name: string;
        email: string;
    };
};

export type CreateCLIKeyResponse = {
    key: string;
    message?: string;
};
