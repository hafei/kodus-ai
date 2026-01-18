import picomatch from 'picomatch';

/**
 * Checks if a file matches any of the provided Glob patterns.
 * @param filename Name of the file to be checked.
 * @param patterns Array of Glob patterns.
 * @returns Boolean indicating whether the file matches any pattern.
 */
export const isFileMatchingGlob = (
    filename: string,
    patterns: string[],
): boolean => {
    if (!patterns || patterns.length === 0) {
        return false;
    }

    // Normalize filename to increase cross-platform and provider compatibility
    // - Convert backslashes to forward slashes
    // - Remove leading './' segments
    // - Remove leading '/' so patterns like '.cursor/**' match '/.cursor/**'
    const normalizedFilename = (filename || '')
        .replace(/\\/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '');

    // Compile the patterns once for better performance
    const matchers = patterns.map((pattern) =>
        picomatch(pattern, { dot: true }),
    );

    // Check if any matcher matches the filename
    return matchers.some((matcher) => matcher(normalizedFilename));
};

/**
 * Checks if a file matches any of the provided Glob patterns (case-insensitive).
 * Useful for external file references where users might not remember exact casing.
 * @param filename Name of the file to be checked.
 * @param patterns Array of Glob patterns.
 * @returns Boolean indicating whether the file matches any pattern (ignoring case).
 */
export const isFileMatchingGlobCaseInsensitive = (
    filename: string,
    patterns: string[],
): boolean => {
    if (!patterns || patterns.length === 0) {
        return false;
    }

    const normalizedFilename = (filename || '')
        .replace(/\\/g, '/')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '');

    const matchers = patterns.map((pattern) =>
        picomatch(pattern, { dot: true, nocase: true }),
    );

    return matchers.some((matcher) => matcher(normalizedFilename));
};
