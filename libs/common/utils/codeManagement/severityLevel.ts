import { SeverityLevel } from '../enums/severityLevel.enum';

enum ShieldColor {
    LOW_BLUE = '1A8EBC',
    MEDIUM_BLUE = '1A7BBE',
    HIGH_PURPLE = '6B6B92',
    CRITICAL_RED = 'FF3D3D',
    ISSUE_RED = 'E53935',
    WARNING_AMBER = 'F9A825',
}

const normalizeSeverityLevel = (
    severityLevel?: SeverityLevel | 'issue' | 'warning' | string,
): SeverityLevel | null => {
    switch ((severityLevel || '').toLowerCase()) {
        case SeverityLevel.CRITICAL:
            return SeverityLevel.CRITICAL;
        case SeverityLevel.HIGH:
            return SeverityLevel.HIGH;
        case SeverityLevel.MEDIUM:
            return SeverityLevel.MEDIUM;
        case SeverityLevel.LOW:
            return SeverityLevel.LOW;
        case 'issue':
            return SeverityLevel.HIGH;
        case 'warning':
            return SeverityLevel.LOW;
        default:
            return null;
    }
};

const getSeverityLevelShield = (
    severityLevel?: SeverityLevel | 'issue' | 'warning' | string,
) => {
    const normalizedSeverity = normalizeSeverityLevel(severityLevel);
    if (!normalizedSeverity) return '';

    const labelTitle = 'severity_level';
    const shield = `![${normalizedSeverity}](https://img.shields.io/badge/${labelTitle}-${normalizedSeverity.replace(/ /g, '_')}-`;

    switch (normalizedSeverity) {
        case SeverityLevel.LOW:
            return `${shield}${ShieldColor.LOW_BLUE})`;
        case SeverityLevel.MEDIUM:
            return `${shield}${ShieldColor.MEDIUM_BLUE})`;
        case SeverityLevel.HIGH:
            return `${shield}${ShieldColor.HIGH_PURPLE})`;
        case SeverityLevel.CRITICAL:
            return `${shield}${ShieldColor.CRITICAL_RED})`;
        default:
            return '';
    }
};

/**
 * V3 level shield: critical (red), issue (red), or warning (amber).
 * Used when codeReviewVersion is v3-agent.
 */
const getLevelShield = (level?: 'critical' | 'issue' | 'warning') => {
    if (!level) return '';
    const labelTitle = 'level';
    const shield = `![${level}](https://img.shields.io/badge/${labelTitle}-${level}-`;

    switch (level) {
        case 'critical':
            return `${shield}${ShieldColor.CRITICAL_RED})`;
        case 'issue':
            return `${shield}${ShieldColor.ISSUE_RED})`;
        case 'warning':
            return `${shield}${ShieldColor.WARNING_AMBER})`;
        default:
            return '';
    }
};

export { getSeverityLevelShield, getLevelShield };
