import { createLogger } from '@kodus/flow';
import {
    DocumentationItem,
    DocumentationQueryPlanByFile,
} from '@libs/code-review/pipeline/context/code-review-pipeline.context';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    Context7,
    type Documentation,
    type Library,
} from '@upstash/context7-sdk';

@Injectable()
export class DocumentationSearchContext7Service {
    private readonly logger = createLogger(
        DocumentationSearchContext7Service.name,
    );
    private readonly context7Client: Context7 | null;

    constructor(private readonly configService: ConfigService) {
        const apiKey =
            this.configService.get<string>('CONTEXT7_API_KEY') ||
            this.configService.get<string>('API_CONTEXT7_KEY') ||
            process.env.CONTEXT7_API_KEY;

        this.context7Client = apiKey ? new Context7({ apiKey }) : null;
    }

    async searchByFilePlan(
        planByFile: Record<string, DocumentationQueryPlanByFile>,
    ): Promise<Record<string, DocumentationItem[]>> {
        if (!this.context7Client) {
            this.logger.warn({
                message:
                    'CONTEXT7_API_KEY is not configured, skipping Context7 documentation search',
                context: DocumentationSearchContext7Service.name,
            });

            return {};
        }

        const fileResults = await Promise.all(
            Object.entries(planByFile).map(async ([filePath, plan]) => {
                const docs = await this.searchForPlan(plan);
                return [filePath, docs] as const;
            }),
        );

        return Object.fromEntries(fileResults);
    }

    private async searchForPlan(
        plan: DocumentationQueryPlanByFile,
    ): Promise<DocumentationItem[]> {
        const queryTasks = this.buildQueryTasks(plan).slice(0, 5);

        if (!queryTasks.length || !this.context7Client) {
            return [];
        }

        const queryResults = await Promise.allSettled(
            queryTasks.map((task) => this.searchQuery(task)),
        );

        const items: DocumentationItem[] = [];

        for (const queryResult of queryResults) {
            if (queryResult.status === 'fulfilled' && queryResult.value) {
                items.push(queryResult.value);
            }
        }

        return this.deduplicateByQuery(items).slice(0, 20);
    }

    private async searchQuery(task: {
        query: string;
        packageName: string;
    }): Promise<DocumentationItem | null> {
        if (!this.context7Client) {
            return null;
        }

        try {
            const libraries = await this.context7Client.searchLibrary(
                task.query,
                task.packageName,
            );
            const selectedLibrary = this.selectBestLibrary(libraries);

            if (!selectedLibrary) {
                return null;
            }

            const packageScopedQuery = this.buildPackageScopedQuery(
                task.packageName,
                task.query,
            );

            const docs = await this.context7Client.getContext(
                packageScopedQuery,
                selectedLibrary.id,
                { type: 'json' },
            );

            const snippetDoc = this.selectBestDocumentation(docs);
            if (!snippetDoc) {
                return null;
            }

            return {
                url:
                    snippetDoc.source ||
                    `https://context7.com${selectedLibrary.id}`,
                title:
                    snippetDoc.title ||
                    `Documentation for ${selectedLibrary.name}`,
                source: 'context7-search',
                snippet: this.buildSnippet(snippetDoc.content, task.query),
                query: packageScopedQuery,
            };
        } catch (error) {
            this.logger.warn({
                message: `Context7 search failed for query: ${task.query}`,
                context: DocumentationSearchContext7Service.name,
                error,
            });

            return null;
        }
    }

    private selectBestLibrary(libraries: Library[]): Library | null {
        if (!libraries.length) {
            return null;
        }

        return [...libraries].sort((a, b) => {
            if (b.benchmarkScore !== a.benchmarkScore) {
                return b.benchmarkScore - a.benchmarkScore;
            }
            if (b.trustScore !== a.trustScore) {
                return b.trustScore - a.trustScore;
            }
            return b.totalSnippets - a.totalSnippets;
        })[0];
    }

    private selectBestDocumentation(
        docs: Documentation[],
    ): Documentation | null {
        if (!docs.length) {
            return null;
        }

        return docs[0];
    }

    private buildQueryTasks(plan: DocumentationQueryPlanByFile): Array<{
        query: string;
        packageName: string;
    }> {
        const queries = (plan.queries || []).filter(Boolean);
        const packages = (plan.relevantPackages || [])
            .map((pkg) => (pkg || '').trim())
            .filter(Boolean);

        if (!queries.length) {
            return [];
        }

        if (!packages.length) {
            return queries.map((query) => ({
                query,
                packageName: 'framework',
            }));
        }

        return queries.map((query, index) => ({
            query,
            packageName: packages[index % packages.length],
        }));
    }

    private buildPackageScopedQuery(
        packageName: string,
        query: string,
    ): string {
        return `Package: ${packageName}. Query: ${query}. Restrict context to this package's official documentation and APIs.`;
    }

    private buildSnippet(text: string | undefined, query: string): string {
        const sanitized = (text || '').replace(/\s+/g, ' ').trim();

        if (!sanitized) {
            return `No extract was returned by Context7 for query: ${query}`;
        }

        return sanitized.slice(0, 320);
    }

    private deduplicateByQuery(
        items: DocumentationItem[],
    ): DocumentationItem[] {
        const byQuery = new Map<string, DocumentationItem>();

        for (const item of items) {
            if (!byQuery.has(item.query)) {
                byQuery.set(item.query, item);
            }
        }

        return [...byQuery.values()];
    }
}
