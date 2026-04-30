/**
 * Public runtime config exposed to the browser.
 *
 * Anything in this shape is serialized into the SSR HTML and visible to
 * any user with devtools. Treat it like public data. Server-only secrets
 * (database URLs, OAuth client secrets, internal hostnames) MUST NOT
 * appear here — keep them as direct `process.env.X` reads in server-only
 * modules guarded by `import 'server-only'`.
 */
export type PublicConfig = {
    githubInstallUrl: string;
    bitbucketInstallUrl: string;
    gitlabClientId: string;
    gitlabRedirectUrl: string;
    gitlabScopes: string;
    gitlabOauthUrl: string;
    termsAndConditions: string;
    supportDocsUrl: string;
    supportDiscordInviteUrl: string;
    supportTalkToFounderUrl: string;
    tokenDocsGithub: string;
    tokenDocsGitlab: string;
    tokenDocsBitbucket: string;
    tokenDocsAzureRepos: string;
    ruleFilesDocs: string;
    releaseVersion: string;
    // Distinguishes "development" / "production" / "self-hosted" so
    // client components (e.g. sso-callback) can decide things like
    // shared-cookie domain without reading process.env in the browser.
    nodeEnv: string;
    // Public, absolute URL of the API as the *browser* sees it
    // (e.g. "http://localhost:3001" in dev, "https://api.kodus.io" in
    // prod). Populated from process.env.API_URL — the same env the
    // API itself uses to build the SAML ACS callback in
    // libs/ee/sso/strategies/saml-auth.strategy.ts. Reusing one env
    // guarantees the URL displayed in the SSO settings matches the
    // URL the API will accept on callback.
    //
    // NOT the same as the cluster-internal hostname (WEB_HOSTNAME_API
    // / WEB_PORT_API) used by pathToApiUrl on the server.
    //
    // Used for flows where the browser MUST navigate to the API
    // directly instead of going through /api/proxy/api/* — chiefly
    // SAML SSO, where the API needs to set session cookies on its own
    // origin so they're still readable when the IdP POSTs the
    // SAMLResponse back to the same origin.
    apiPublicUrl: string;
};
// Note: WEB_TERMS_AND_CONDITIONS has no client consumer yet, but it's
// populated end-to-end (SSM → CI workflow → .env, with a real Notion URL
// in dev). Keeping it exposed in publicConfig so a future Terms page can
// just read useConfig().termsAndConditions without re-plumbing infra.
