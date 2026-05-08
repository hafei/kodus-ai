const API_PREFIX = '/notifications';

export const NOTIFICATION_PATHS = {
    LIST: API_PREFIX,
    UNREAD_COUNT: `${API_PREFIX}/unread-count`,
    STREAM: `${API_PREFIX}/stream`,
    MARK_READ: (id: string) => `${API_PREFIX}/${id}/read`,
    MARK_ALL_READ: `${API_PREFIX}/mark-all-read`,
    ROUTING_RULES: `${API_PREFIX}/routing-rules`,
    ROUTING_RULES_RESET: `${API_PREFIX}/routing-rules/reset`,
} as const;
