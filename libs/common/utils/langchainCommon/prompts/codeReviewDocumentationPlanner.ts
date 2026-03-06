import z from 'zod';

export interface DocumentationPlannerFilePayload {
    filePath: string;
    fileContent: string;
    diff: string;
}

export interface DocumentationPlannerPayload {
    packages: Array<{
        name: string;
        version?: string;
        ecosystem: string;
        sourceFile: string;
    }>;
    file: DocumentationPlannerFilePayload;
}

export const DocumentationPlannerSchema = z.object({
    queryTasks: z
        .array(
            z.object({
                packageName: z.string().min(1),
                query: z.string().min(1),
            }),
        )
        .max(8),
});

export type DocumentationPlannerSchemaType = z.infer<
    typeof DocumentationPlannerSchema
>;

export const prompt_code_review_documentation_planner_system = () => {
    return `You are an expert software documentation planner. Given a source code file, a diff of changes, and a list of repository packages, you pinpoint which packages are most relevant specifically to the proposed code change (the diff) and generate laser-focused documentation search queries.

Your core philosophy is "less is more". Your absolute focus is the provided diff of changes. You must only generate queries for APIs, functions, or concepts that are actively being added, modified, or uniquely impacted in the diff.

Always bias selections toward complex, high-leverage dependencies (frameworks, ORMs, cloud SDKs) that are present in the diff, and ignore packages that are just part of the surrounding file context but not part of the actual code change.

Never try to hit the maximum query limit. Returning 0, 1, or 2 highly targeted queries is vastly preferred over padding the results with generic searches. Focus strictly on finding practical implementation guidance for the specific syntax, methods, or API usage introduced or altered in the diff.`;
};

export const prompt_code_review_documentation_planner_user = (
    payload: DocumentationPlannerPayload,
) => {
    const packagesPreview = payload.packages
        .slice(0, 120)
        .map(
            (pkg) =>
                `- ${pkg.name}${pkg.version ? `@${pkg.version}` : ''} (${pkg.ecosystem}) from ${pkg.sourceFile}`,
        )
        .join('\n');

    const fileContentPreview = payload.file.fileContent || '';
    const diffPreview = payload.file.diff || '';

    return `Analyze the target diff and repository package dependencies to propose highly targeted documentation searches.

Rules:
- Return JSON only following the configured parser schema.
- Focus strictly on the changed lines (diff excerpt). Do not generate queries for existing code in the file content excerpt that was not modified.
- Less is more: Provide ONLY the queryTasks strictly necessary for the diff. Often 0-2 queryTasks is the correct amount. Do not pad the array up to 8.
- Only include a package if its API, method, or class is directly added, altered, or manipulated within the diff excerpt.
- Prioritize complex/runtime-defining packages first (frameworks, platforms, ORMs, cloud/infra SDKs, auth).
- Ignore low-complexity dependencies (utilities, linters, types) unless they are the primary subject of the diff.
- Queries should be highly specific to the exact functions, hooks, or classes changed in the diff rather than broad conceptual overviews.
- Use 'en-US' for query text.
- Each queryTask must contain both packageName and query. Do not return unpaired package or query arrays.

Target file: ${payload.file.filePath}

Repository packages:
${packagesPreview || '- (no packages provided)'}

Target file content excerpt (for context only):
${fileContentPreview || '(empty)'}

Target diff excerpt (YOUR SOLE FOCUS):
${diffPreview || '(empty)'}

Output instructions: Return queryTasks only. Each queryTask must include packageName and documentation-oriented query, explicitly paired in the same item. Base your queryTasks *exclusively* on the additions and modifications shown in the target diff excerpt. Avoid generic package documentation searches.`;
};
