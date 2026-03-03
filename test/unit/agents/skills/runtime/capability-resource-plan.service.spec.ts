import { CapabilityResourcePlanService } from '@libs/agents/skills/runtime/capability-resource-plan.service';

describe('CapabilityResourcePlanService', () => {
    it('loads seeded tools from the runtime capability seeds folder', () => {
        const service = new CapabilityResourcePlanService();

        const tools = service.getSeedTools('jira', 'task.context.read');

        expect(tools).toEqual([
            'getJiraIssue',
            'searchJiraIssuesUsingJql',
            'search',
            'fetch',
        ]);
    });

    it('loads seeded tools for non-jira providers', () => {
        const service = new CapabilityResourcePlanService();

        const linearTools = service.getSeedTools('linear', 'task.context.read');
        const notionTools = service.getSeedTools('notion', 'task.context.read');
        const clickupTools = service.getSeedTools('clickup', 'task.context.read');

        expect(linearTools).toEqual([
            'get_issue',
            'list_issues',
            'get_project',
            'get_team',
        ]);
        expect(notionTools).toEqual([
            'Fetch Notion Data',
            'Search Notion page',
            'Fetch database row',
            'Query database',
            'Get page property',
        ]);
        expect(clickupTools).toEqual([
            'Get Task',
            'Get Tasks',
            'Get List',
            'Get Space',
        ]);
    });

    it('stores and retrieves cached tools by tenant scope', async () => {
        const service = new CapabilityResourcePlanService();
        const scope = {
            organizationId: 'org-1',
            teamId: 'team-1',
            skillName: 'business-rules-validation',
            capability: 'task.context.read',
            provider: 'jira',
        };

        await service.saveCachedTools(scope, ['search', 'getJiraIssue']);
        const cached = await service.getCachedTools(scope);

        expect(cached).toEqual(['search', 'getJiraIssue']);
    });
});
