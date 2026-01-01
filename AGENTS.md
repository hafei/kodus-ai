# AGENTS.md

This document provides essential information for agents working in the Kodus AI codebase.

## Project Overview

Kodus AI is an AI-powered code review platform built as a **NestJS monorepo** with a clean architecture following Domain-Driven Design (DDD) principles.

### Architecture Type

- **Framework**: NestJS (TypeScript)
- **Pattern**: Clean Architecture / DDD with use-case driven approach
- **Database**: PostgreSQL (via TypeORM) + MongoDB (via Mongoose)
- **Message Queue**: RabbitMQ (via @golevelup/nestjs-rabbitmq)
- **API Style**: REST with JWT authentication
- **Testing**: Jest

### Project Structure

```
kodus-ai/
├── apps/                    # NestJS applications
│   ├── api/                # Main REST API (port 3001, debug 9229)
│   ├── worker/             # Background job processor (debug 9231)
│   └── webhooks/           # Webhook handler (port 3332, debug 9230)
├── libs/                   # Domain and business logic libraries
│   ├── ai-engine/          # AI/LLM integration and orchestration
│   ├── automation/         # Code review automation
│   ├── code-review/        # Core code review logic
│   ├── dryRun/            # Dry run functionality
│   ├── ee/                # Enterprise features
│   ├── identity/          # Auth, users, permissions
│   ├── integrations/       # GitHub, GitLab, etc. integrations
│   ├── kodyRules/         # Custom review rules management
│   ├── mcp-server/        # Model Context Protocol server
│   ├── organization/       # Organization, team management
│   ├── platform/          # Platform abstraction (GitHub, GitLab, etc.)
│   ├── platformData/      # Platform-specific data
│   └── shared/            # Shared infrastructure modules
├── packages/              # Reusable packages
│   ├── kodus-common/      # Common utilities and types
│   └── kodus-flow/        # AI agent orchestration framework
└── test/                  # Test files
```

## Essential Commands

### Development

```bash
# First-time setup (recommended)
yarn setup

# Start all services in Docker
yarn docker:start

# Start with local databases
yarn docker:up --profile local-db

# Stop all services
yarn docker:down

# View logs
yarn docker:logs

# Health check
yarn dev:health-check
```

### Building

```bash
# Build all apps
yarn build

# Build individual app
yarn build:api          # or build:webhooks, build:worker
yarn build:fast         # Faster webpack build
```

### Testing

```bash
# Run all tests (with DB)
yarn test               # Runs with --runInBand --detectOpenHandles --forceExit

# Run tests in watch mode
yarn test:watch

# Run with coverage
yarn test:cov

# Run e2e tests
yarn test:e2e

# Run tests with development environment
API_NODE_ENV=development yarn test:dev
```

### Linting & Formatting

```bash
# Lint and fix
yarn lint

# Format code
yarn format

# Type check
yarn typecheck
```

### Database Migrations

```bash
# Generate migration
yarn migration:generate MigrationName

# Run migrations
yarn migration:run

# Revert migration
yarn migration:revert

# Seed database
yarn seed
```

### Package Management (Yalc for Local Development)

For developing packages in `packages/kodus-common` and `packages/kodus-flow`:

```bash
# Full local dev with hot reload
yarn dev:yalc

# Update packages in container
yarn yalc:update:all
```

## Code Organization & Patterns

### Clean Architecture Layers

The codebase follows a strict layering pattern in the `libs/` directory:

```
libs/[domain]/
├── domain/
│   ├── entities/           # Domain entities (pure business logic)
│   ├── interfaces/        # Domain interfaces and types
│   ├── contracts/         # Repository/Service contracts (interfaces)
│   └── enums/            # Domain enums
├── infrastructure/
│   └── adapters/
│       ├── repositories/   # Data access implementations
│       │   └── schemas/    # TypeORM/Mongoose models
│       └── services/       # External service integrations
├── application/
│   └── use-cases/        # Business logic orchestration
├── dtos/                 # Data Transfer Objects
└── modules/              # NestJS module definitions
```

### Key Patterns

#### 1. Repository Pattern

```typescript
// Contract (interface)
// libs/[domain]/domain/contracts/[entity].repository.contract.ts
export interface IOrganizationRepository {
    find(filter: Partial<IOrganization>): Promise<OrganizationEntity[]>;
    create(data: IOrganization): Promise<OrganizationEntity>;
}

// Implementation
// libs/[domain]/infrastructure/adapters/repositories/[entity].repository.ts
@Injectable()
export class OrganizationDatabaseRepository implements IOrganizationRepository {
    // Implementation using TypeORM
}

// Usage token injection
export const ORGANIZATION_REPOSITORY_TOKEN = 'ORGANIZATION_REPOSITORY_TOKEN';

// In providers
{
    provide: ORGANIZATION_REPOSITORY_TOKEN,
    useClass: OrganizationDatabaseRepository
}
```

#### 2. Use Case Pattern

```typescript
// libs/[domain]/application/use-cases/[use-case-name].use-case.ts
@Injectable()
export class CreateOrganizationUseCase {
    constructor(
        @Inject(ORGANIZATION_REPOSITORY_TOKEN)
        private readonly organizationRepository: IOrganizationRepository,
    ) {}

    async execute(data: CreateOrganizationDto): Promise<OrganizationEntity> {
        // Business logic here
    }
}
```

#### 3. Entity Pattern

Entities are domain objects with private fields and getter methods:

```typescript
export class OrganizationEntity implements Entity<IOrganization> {
    private _uuid: string;
    private _name: string;

    private constructor(organization: IOrganization) {
        this._uuid = organization.uuid;
        this._name = organization.name;
    }

    public static create(organization: IOrganization): OrganizationEntity {
        return new OrganizationEntity(organization);
    }

    public get uuid() {
        return this._uuid;
    }

    public toObject(): IOrganization {
        return { uuid: this._uuid, name: this._name };
    }
}
```

#### 4. Controller Pattern

Controllers should be thin - delegate to use cases:

```typescript
@Controller('organization')
export class OrganizationController {
    constructor(
        private readonly createOrganizationUseCase: CreateOrganizationUseCase,
    ) {}

    @Post()
    public async create(@Body() dto: CreateOrganizationDto) {
        return await this.createOrganizationUseCase.execute(dto);
    }
}
```

#### 5. DTO Pattern

Use class-validator decorators for validation:

```typescript
import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateUserDto {
    @IsString()
    @IsEmail()
    public email: string;

    @IsString()
    @IsOptional()
    public password: string;
}
```

### Module Organization

- Each domain has its own module: `OrganizationModule`, `KodyRulesModule`, etc.
- Modules are composed in `apps/api/src/api.module.ts` for the API
- Shared modules in `libs/shared/` provide cross-cutting concerns

## Naming Conventions

### Files

- **Use cases**: `[action]-[entity].use-case.ts` (e.g., `create-organization.use-case.ts`)
- **Repositories**: `[entity].repository.ts`
- **Contracts**: `[entity].repository.contract.ts` or `[entity].service.contract.ts`
- **Entities**: `[entity].entity.ts`
- **DTOs**: `[action]-[entity].dto.ts` (e.g., `create-user.dto.ts`)
- **Schemas (TypeORM)**: `[entity].model.ts`
- **Controllers**: `[entity].controller.ts`
- **Services**: `[entity].service.ts`

### Classes

- **Entities**: `OrganizationEntity`, `UserEntity`
- **Use Cases**: `CreateOrganizationUseCase`, `GetOrganizationsByDomainUseCase`
- **Repositories**: `OrganizationDatabaseRepository`, `UserDatabaseRepository`
- **Controllers**: `OrganizationController`, `UserController`
- **Services**: `OrganizationService`, `AuthorizationService`
- **DTOs**: `CreateOrganizationDto`, `UpdateUserDto`

### Tokens

Dependency injection tokens follow the pattern:
```typescript
export const [ENTITY]_[TYPE]_TOKEN = '[ENTITY]_[TYPE]_TOKEN';
// e.g., ORGANIZATION_REPOSITORY_TOKEN, KODY_RULES_SERVICE_TOKEN
```

## Testing Approach

### Test Structure

Tests are organized by type:
- **Unit tests**: `test/unit/**/*.spec.ts`
- **Integration tests**: `test/integration/**/*.integration.spec.ts`
- **E2e tests**: `test/jest-e2e.json`

### Test Configuration

- Test file pattern: `**/*.spec.ts`, `**/*.integration.spec.ts`, `**/*.e2e-spec.ts`
- Uses ts-jest for TypeScript compilation
- Run in band (sequentially) to avoid DB conflicts
- Detect open handles to prevent hanging tests

### Writing Tests

```typescript
describe('CreateOrganizationUseCase', () => {
    let useCase: CreateOrganizationUseCase;
    let repository: Mock<IOrganizationRepository>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                CreateOrganizationUseCase,
                {
                    provide: ORGANIZATION_REPOSITORY_TOKEN,
                    useValue: mockRepository,
                },
            ],
        }).compile();

        useCase = module.get(CreateOrganizationUseCase);
    });

    it('should create an organization', async () => {
        // Test implementation
    });
});
```

### Running Tests in CI

Tests run automatically on PR via `.github/workflows/tests.yml`:
1. Checkout code
2. Start test containers (docker-compose.test.yml)
3. Run migrations
4. Execute tests with `API_NODE_ENV=test yarn test`

## Database Setup

### PostgreSQL (Primary)

- **ORM**: TypeORM
- **Config**: `libs/core/infrastructure/database/typeorm/`
- **Models**: Located in each lib's `infrastructure/adapters/repositories/schemas/*.model.ts`
- **Migrations**: `libs/core/infrastructure/database/typeorm/migrations/`
- **Extension**: pgvector for vector storage

### MongoDB (Secondary)

- **ODM**: Mongoose
- **Config**: `libs/core/infrastructure/database/mongodb/`
- **Schemas**: Located in each lib's `infrastructure/adapters/repositories/schemas/mongoose/*.model.ts`
- **Usage**: Caching, analytics, and document storage

### Environment Variables

Database connection strings are configured via environment variables:
- `API_PG_DB_HOST`, `API_PG_DB_PORT`, `API_PG_DB_DATABASE`
- `API_PG_DB_USERNAME`, `API_PG_DB_PASSWORD`
- `API_MG_DB_HOST`, `API_MG_DB_PORT`, `API_MG_DB_DATABASE`
- `API_MG_DB_USERNAME`, `API_MG_DB_PASSWORD`

## Docker Setup

### Development Stack

The `docker-compose.dev.yml` provides three services:

```yaml
services:
  api:         # Main API - ports 3001:3001, 9229:9229
  worker:      # Background jobs - port 9231:9231
  webhooks:    # Webhook handler - ports 3332:3332, 9230:9230
  db_postgres: # PostgreSQL 16 + pgvector - port 5432
  db_mongodb:  # MongoDB 8 - port 27017
```

### Key Features

- **Hot reload**: Uses file watching with polling (CHOKIDAR_USEPOLLING=true)
- **Debug ports**: Each service has a debug port exposed
- **Memory limits**: API: 2GB, Worker: 3GB
- **Local DB profile**: Use `--profile local-db` to include databases

### Docker Commands

```bash
# Start all services
yarn docker:start

# Start with local DB
yarn docker:up --profile local-db

# Start individual service
yarn docker:start:api

# View logs
yarn docker:logs

# Stop services
yarn docker:down

# Clean restart (removes volumes)
yarn docker:clean
```

## Package Management

### Main Project

- **Package Manager**: Yarn
- **Node Version**: >= 18.0.0
- **Dependencies**: Listed in root `package.json`

### Local Package Development (Yalc)

The project uses `yalc` for local development of packages in `packages/`:

```bash
# Setup local packages in containers
yarn dev:yalc:init

# Start with yalc watching
yarn dev:yalc

# Update all packages
yarn yalc:update:all
```

When modifying packages in `packages/kodus-common` or `packages/kodus-flow`:
1. Run `yarn dev:yalc:init` to publish locally
2. Changes are hot-reloaded into running containers
3. Use `yarn yalc:push` when needed

## Code Style & Formatting

### Prettier Configuration

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 4,
  "semi": true,
  "quoteProps": "consistent"
}
```

### ESLint Configuration

- Uses `@typescript-eslint` with TypeScript support
- `unused-imports/no-unused-imports` enforces import cleanup
- Key rules:
  - No explicit any (`@typescript-eslint/no-explicit-any: 'off'`)
  - Unused imports are errors
  - Unused vars prefixed with `_` are allowed

### Type Checking

```bash
yarn typecheck
```

Uses TypeScript with:
- `strictNullChecks: false`
- `noImplicitAny: false`
- `skipLibCheck: true`

## Important Gotchas

### 1. TypeScript Path Aliases

When importing from libs:
```typescript
import { OrganizationService } from '@libs/organization/infrastructure/adapters/services/organization.service';
import { OrganizationEntity } from '@libs/organization/domain/organization/entities/organization.entity';
```

Paths are defined in `tsconfig.json`:
- `@libs/*` → `./libs/*`
- `@apps/*` → `./apps/*/src`

### 2. Dependency Injection Tokens

Always use explicit tokens for repositories and services:
```typescript
constructor(
    @Inject(ORGANIZATION_REPOSITORY_TOKEN)
    private readonly organizationRepository: IOrganizationRepository,
) {}
```

### 3. Database Migrations

Always test migrations in development:
```bash
yarn migration:generate MigrationName
yarn migration:run
```

Migrations must be run before the application starts. Docker containers handle this automatically with `RUN_MIGRATIONS=true`.

### 4. Test Configuration

Tests require `--runInBand --detectOpenHandles --forceExit` to prevent hanging:
```bash
yarn test  # Includes these flags automatically
```

### 5. File Watching in Docker

File watching uses polling for Docker compatibility:
```yaml
environment:
  - CHOKIDAR_USEPOLLING=true
  - CHOKIDAR_INTERVAL=3000
```

### 6. Multi-Database Transactions

When working with both PostgreSQL and MongoDB:
- Use repository pattern for PostgreSQL
- Use Mongoose models for MongoDB
- No distributed transactions - handle failures appropriately

### 7. Error Handling

Use structured logging throughout:
```typescript
this.logger.error({
    message: 'Error description',
    context: ClassName.name,
    error,
    metadata: { /* relevant data */ },
});
```

### 8. Validation

Always use class-validator for DTOs and enable validation pipe in main.ts:
```typescript
app.useGlobalPipes(
    new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: {
            enableImplicitConversion: true,
        },
    }),
);
```

### 9. Background Jobs

For async operations that shouldn't block:
```typescript
setImmediate(async () => {
    try {
        // Background task
    } catch (error) {
        this.logger.error({ message: 'Background task failed', error });
    }
});
```

### 10. Memory Management

Set Node.js memory limit in Docker:
```yaml
environment:
  - NODE_OPTIONS=--max-old-space-size=4096
```

API: 2GB limit, Worker: 3GB limit (in docker-compose)

## CI/CD

### GitHub Actions

- **Tests**: Run on every PR to main via `.github/workflows/tests.yml`
- **Build & Deploy**: Separate workflows for QA/Prod deployment
- **Comment on Failure**: Bot comments on PR if tests fail

### Pre-commit Hook

Checks yalc status before committing:
```bash
node scripts/check-yalc.js
```

### Pre-push Hook

Currently empty but can be configured.

## Logging & Observability

### Logging

- Uses Pino logger via `LoggerWrapperService`
- Structured logging with context
- Pretty logging in development: `API_LOG_PRETTY=true`

### OpenTelemetry

- Integrated with `@opentelemetry/sdk-node`
- Export traces via OTLP
- Configured via `ObservabilityService`

### Sentry

- Error tracking and performance monitoring
- Sourcemap upload: `yarn sentry:sourcemaps`

## Authentication & Authorization

### Authentication

- JWT-based auth via `@nestjs/passport`
- SAML support available
- OAuth integration with GitHub, GitLab, etc.

### Authorization

- CASL-based permissions (`@casl/ability`)
- Policy guards: `@UseGuards(PolicyGuard)`
- Decorators: `@CheckPolicies(checkPermissions({...}))`

## Platform Integrations

### Supported Platforms

- GitHub (via `@octokit/rest`)
- GitLab (via `@gitbeaker/rest`)
- Bitbucket (via `bitbucket`)
- Azure Repos (via `azure-devops-node-api`)

### Integration Pattern

Platform integration is abstracted via interfaces:
- `IPlatformIntegration`
- `IWebhookEventHandler`
- `ICodeManagement`

Each platform implements these interfaces in `libs/platform/`.

## AI/LLM Integration

### LLM Providers

Supports multiple providers via LangChain:
- OpenAI
- Anthropic (Claude)
- Google Gemini/Vertex AI
- BYOK (Bring Your Own Key)

### Kodus Flow Package

`@kodus/flow` provides:
- Agent orchestration
- MCP (Model Context Protocol) support
- Workflow engine
- Runtime with observability

### LLM Service

Located in `@kodus/kodus-common/llm`:
- Unified interface for multiple providers
- Prompt runner
- Builder pattern for LLM configuration

## Performance Considerations

1. **Connection Pooling**: PostgreSQL pool size = 25
2. **Caching**: Use `CacheService` for frequently accessed data
3. **Batch Processing**: Limit batch sizes for heavy operations
4. **Lazy Loading**: Use TypeORM relations wisely
5. **Memory Limits**: Set appropriate `NODE_OPTIONS` for each service

## Troubleshooting

### Common Issues

**Tests hang**:
- Ensure `--runInBand --detectOpenHandles --forceExit` flags are used
- Check for unclosed database connections
- Verify cleanup in `afterEach` hooks

**Docker containers can't connect to DB**:
- Check network: `docker network ls` (should see `kodus-backend-services`)
- Verify environment variables in `.env`
- Use `--profile local-db` to start local databases

**TypeScript errors in libs**:
- Ensure `tsconfig.json` paths are correct
- Check barrel exports (index.ts files)
- Run `yarn typecheck` to verify

**Hot reload not working**:
- Verify `CHOKIDAR_USEPOLLING=true` is set
- Check that volumes are mounted correctly
- Ensure files are being watched (check logs)

**Migration fails**:
- Verify DB connection in `.env`
- Check migration file syntax
- Ensure TypeORM config is correct

## Memory Files

This project uses a memory system to store context and preferences. The only existing memory file is:

- `.cursor/rules/run.mdc` - Empty rule file (alwaysApply: true)

Agents should update this file with discovered commands and patterns.
