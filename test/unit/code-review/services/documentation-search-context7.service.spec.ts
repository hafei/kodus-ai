import { DocumentationSearchContext7Service } from '@libs/code-review/infrastructure/adapters/services/documentation-search-context7.service';
import { ConfigService } from '@nestjs/config';

const searchLibraryMock = jest.fn();
const getContextMock = jest.fn();

jest.mock('@upstash/context7-sdk', () => ({
    Context7: jest.fn().mockImplementation(() => ({
        searchLibrary: searchLibraryMock,
        getContext: getContextMock,
    })),
}));

describe('DocumentationSearchContext7Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should skip search when API key is missing', async () => {
        const configService = {
            get: jest.fn().mockReturnValue(undefined),
        } as unknown as ConfigService;

        const service = new DocumentationSearchContext7Service(configService);
        const result = await service.searchByFilePlan({
            'src/a.ts': {
                relevantPackages: ['react'],
                queries: ['hooks'],
            },
        });

        expect(result).toEqual({});
        expect(searchLibraryMock).not.toHaveBeenCalled();
        expect(getContextMock).not.toHaveBeenCalled();
    });

    it('should return documentation using Context7 for each query task', async () => {
        const configService = {
            get: jest.fn((key: string) => {
                if (key === 'CONTEXT7_API_KEY') {
                    return 'ctx7sk_test';
                }
                return undefined;
            }),
        } as unknown as ConfigService;

        searchLibraryMock.mockResolvedValue([
            {
                id: '/facebook/react',
                name: 'React',
                description: 'React docs',
                totalSnippets: 100,
                trustScore: 8,
                benchmarkScore: 90,
            },
        ]);

        getContextMock.mockResolvedValue([
            {
                title: 'Hooks',
                content:
                    'Use useEffect for side effects and return a cleanup function when needed.',
                source: 'https://react.dev/reference/react/useEffect',
            },
        ]);

        const service = new DocumentationSearchContext7Service(configService);

        const result = await service.searchByFilePlan({
            'src/a.ts': {
                relevantPackages: ['react'],
                queries: ['how to use useEffect cleanup'],
            },
        });

        expect(searchLibraryMock).toHaveBeenCalledWith(
            'how to use useEffect cleanup',
            'react',
        );
        expect(getContextMock).toHaveBeenCalledWith(
            expect.stringContaining('Package: react.'),
            '/facebook/react',
            { type: 'json' },
        );

        expect(result['src/a.ts']).toHaveLength(1);
        expect(result['src/a.ts'][0]).toEqual(
            expect.objectContaining({
                source: 'context7-search',
                title: 'Hooks',
                url: 'https://react.dev/reference/react/useEffect',
            }),
        );
    });

    it('should map each query to a single package when multiple packages are present', async () => {
        const configService = {
            get: jest.fn((key: string) =>
                key === 'CONTEXT7_API_KEY' ? 'ctx7sk_test' : undefined,
            ),
        } as unknown as ConfigService;

        searchLibraryMock.mockResolvedValue([
            {
                id: '/nestjs/docs',
                name: 'NestJS',
                description: 'Nest docs',
                totalSnippets: 100,
                trustScore: 8,
                benchmarkScore: 90,
            },
        ]);

        getContextMock.mockResolvedValue([
            {
                title: 'Controllers',
                content: 'Controllers handle incoming requests.',
                source: 'https://docs.nestjs.com/controllers',
            },
        ]);

        const service = new DocumentationSearchContext7Service(configService);

        await service.searchByFilePlan({
            'src/a.ts': {
                relevantPackages: ['@nestjs/common', 'typeorm'],
                queries: ['nestjs controllers', 'typeorm repositories'],
            },
        });

        expect(searchLibraryMock).toHaveBeenNthCalledWith(
            1,
            'nestjs controllers',
            '@nestjs/common',
        );
        expect(searchLibraryMock).toHaveBeenNthCalledWith(
            2,
            'typeorm repositories',
            'typeorm',
        );
    });
});
