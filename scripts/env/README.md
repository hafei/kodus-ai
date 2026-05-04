# Env schema-as-code (POC)

**Problem.** ~200 env vars are duplicated across:

- `kodus-ai/.env.example` (master, dev defaults)
- `kodus-installer/.env.example` (self-hosted user template)
- `kodus/docs/_snippets/*.mdx` and `cookbook/**/*.mdx` (documentation)
- the `.env`, `.env.qa`, `.env.prod` actual values

Adding a var means editing 3+ files and hoping nothing drifts. This POC
proves a single source of truth that **generates** the consumer files.

## Architecture

```
                    .env.schema  (single source of truth)
                         │
            ┌────────────┼─────────────────┐
            ▼            ▼                 ▼
   kodus-ai/             kodus-installer/  docs/_snippets/
   .env.example          .env.example      env-vars-generated.mdx
   (cloud + self-host)   (self-host only)  (full reference table)
```

The schema is a [varlock](https://varlock.dev) `.env.schema` file with
two kinds of metadata:

1. **Standard varlock decorators** — validated by `varlock load`:
   - `@required` / `@optional`
   - `@sensitive`
   - `@type=port|url|email|number|boolean|cron|enum(...)`

2. **Kodus-specific metadata** — plain comments, invisible to varlock,
   read by `scripts/env/generate.ts`:
   - `# kodus: audience=cloud,self-hosted,both`
   - `# kodus: installer-default="<value>"`
   - `# kodus: category=<name>` (per section)

## Example entry

```env
# Symmetric key for column-level encryption (DB).
# @required @sensitive
# kodus: audience=both
API_CRYPTO_KEY=
```

## Example with installer override

```env
# kodus: audience=both installer-default="db_kodus_postgres"
API_PG_DB_HOST=db_postgres
```

The `kodus-ai/.env.example` will get `db_postgres`; the
`kodus-installer/.env.example` will get `db_kodus_postgres`.

## Commands

| Command | What it does |
| --- | --- |
| `yarn env:generate` | Regenerate to `poc-env/` (dry-run, no overwrites) |
| `yarn env:apply` | Regenerate **in place** — overwrites `.env.example` everywhere |
| `yarn env:validate` | Run `varlock load` to validate against schema |
| `yarn env:check` | CI guard: fail if committed files drifted from schema |

## What the POC currently covers

121 of ~198 vars (61%) across 17 sections — Environment, Server, API
Docs, Postgres, Mongo, RabbitMQ, JWT, LLM providers, Git providers,
Observability, Sandbox, Cron, Email, S3, Web frontend, Support links,
Workflow Queue tuning.

The remaining ~77 vars (analytics worker config, MCP manager, BetterStack
heartbeats, GROQ/Cerebras tuning, etc.) follow the same pattern — copy
the section, add audience tags, done.

## Why this beats just "use Infisical"

- **Infisical solves values** (dev/qa/prod secret storage). The schema
  is still your problem.
- **Schema-as-code solves the schema** (what vars exist, types,
  documentation, who needs what).
- **Together** they cover ~95% of the maintenance burden. The 5%
  remaining is prose docs ("why does this var exist?") which no tool
  can generate.

## CI integration (suggested)

```yaml
# .github/workflows/env-drift.yml
- run: yarn env:check
```

Fails the PR if anyone edited `.env.example` directly without updating
`.env.schema`.

## Migration path (non-disruptive)

1. **Today**: schema + generators exist, output goes to `poc-env/` —
   nothing in the existing flow changes.
2. **Next**: cover remaining 77 vars in schema, run `yarn env:apply`,
   commit the regenerated files. From this point `.env.example` files
   are auto-managed.
3. **Then**: add `yarn env:check` to CI.
4. **Optional later**: add varlock secret-manager plugin (Infisical /
   1Password / AWS Secrets) so `varlock run -- yarn start:dev:api`
   pulls real secrets from the manager instead of disk `.env`.

## Known limitations

- `varlock load` validates against `.env`, not just the schema, so it
  flags vars present in `.env` that aren't in the schema yet. This goes
  away as schema coverage reaches 100%.
- varlock auto-infers sensitivity from var names (SECRET, KEY, etc).
  Override with explicit `@optional` if needed.
- The drift check assumes `kodus-installer` is a sibling directory of
  `kodus-ai`. Adjust path in `check-drift.ts` if your layout differs.
