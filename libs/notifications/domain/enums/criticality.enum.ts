export enum Criticality {
    /**
     * Operational system flows (email confirmation, password reset, invites,
     * SSO domain verification). Always delivered via email and never
     * configurable — admins cannot disable them or route them to other
     * channels.
     */
    SYSTEM = 'system',
    CRITICAL = 'critical',
    TRANSACTIONAL = 'transactional',
    INFORMATIONAL = 'informational',
}
