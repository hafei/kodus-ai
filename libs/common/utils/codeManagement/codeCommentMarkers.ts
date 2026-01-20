const KODY_CODE_REVIEW_COMPLETED_MARKER = '## Code Review Completed! 🔥';
const KODY_CODE_REVIEW_COMPLETED_MARKER_ENCODED =
    '## Code Review Completed! ud83dudd25'; // Azure encoded emoji
const KODY_CRITICAL_ISSUE_COMMENT_MARKER = '# Found critical issues please';
const KODY_START_COMMAND_MARKER = '@kody start';

export {
    KODY_CODE_REVIEW_COMPLETED_MARKER,
    KODY_CRITICAL_ISSUE_COMMENT_MARKER,
    KODY_START_COMMAND_MARKER,
};

const EXACT_MARKERS = [
    KODY_CODE_REVIEW_COMPLETED_MARKER,
    KODY_CODE_REVIEW_COMPLETED_MARKER_ENCODED,
    KODY_CRITICAL_ISSUE_COMMENT_MARKER,
] as const;

/**
 * Pattern-based markers to exclude (supports variations)
 * Each pattern can match multiple variations of the same command
 */
const PATTERN_MARKERS = [
    /@?kody\s+(start(-review)?|review)\b|start-review/i,
] as const;

/**
 * Check if a comment contains any Kody marker (exact match or pattern)
 */
export const hasKodyMarker = (text: string | undefined | null): boolean => {
    if (!text) return false;

    const hasExactMatch = EXACT_MARKERS.some((marker) => text.includes(marker));
    if (hasExactMatch) return true;

    const hasPatternMatch = PATTERN_MARKERS.some((pattern) =>
        pattern.test(text),
    );

    return hasPatternMatch;
};

/**
 * Patterns for webhook comment command detection
 * Uses (?=\s|$) lookahead to ensure command ends with whitespace or end of string
 * This prevents matching "review-code" as a review command
 */
export const KODY_REVIEW_COMMAND_PATTERN =
    /^\s*@kody\s+(start-review|review)(?=\s|$)/i;
export const KODY_REVIEW_MARKER_PATTERN = /<!--\s*kody-codereview\s*-->/i;
export const KODY_MENTION_NON_REVIEW_PATTERN =
    /^\s*@kody\b(?!\s+(start-review|review)(?=\s|$))/i;

/**
 * Check if comment is a review command (@kody start-review or @kody review)
 */
export const isReviewCommand = (text: string | undefined | null): boolean => {
    if (!text) return false;
    return KODY_REVIEW_COMMAND_PATTERN.test(text);
};

/**
 * Check if comment has the kody-codereview HTML marker
 */
export const hasReviewMarker = (text: string | undefined | null): boolean => {
    if (!text) return false;
    return KODY_REVIEW_MARKER_PATTERN.test(text);
};

/**
 * Check if comment mentions @kody but is NOT a review command
 */
export const isKodyMentionNonReview = (
    text: string | undefined | null,
): boolean => {
    if (!text) return false;
    return KODY_MENTION_NON_REVIEW_PATTERN.test(text);
};
