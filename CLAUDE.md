# CLAUDE.md

Read `TRADING_JOURNAL_SPEC.md` before making product or architecture decisions.

## Mission

Build the personal futures trading journal defined in the specification.

## Absolute constraints

- Local-first journal.
- IndexedDB/OPFS for journal data.
- No server-side journal database.
- No login/account in V1.
- No broker or TradingView integration.
- No secrets in client code.
- Never commit API keys or personal journal data.
- AI is optional.
- AI never modifies data or makes trading decisions.
- Core journaling must work with AI disabled.
- Financial calculations are deterministic and tested.
- Use schema migrations.

## Development order

1. Foundation
2. Core trades
3. Rules/setups
4. Forecasts
5. Analytics
6. Reviews
7. AI
8. Backups/polish

Do not jump directly to AI.

## Engineering rules

- Use strict TypeScript.
- Keep business logic out of UI components.
- Prefer small domain services.
- Validate data at boundaries.
- Use stable IDs and timestamps.
- Keep source of truth separate from cached derived metrics.
- Avoid unnecessary dependencies.
- Do not invent major product requirements.
- Do not implement excluded V1 features.

## AI rules

Use a provider abstraction.

Recommended boundary:

`app/api/ai/route.ts`

and:

`lib/ai/provider.ts`
`lib/ai/context-builder.ts`
`lib/ai/prompts.ts`
`lib/ai/schemas.ts`

Browser sends only relevant selected context.

Server-side credentials only.

Validate AI responses.

If AI fails, save the trade anyway.

## Data rules

Never silently destroy historical information.

Deleted trades go to trash.

Closed-trade edits retain change history.

Setup merges must not rewrite historical analytics.

Forecast revisions preserve previous versions.

## Testing

After meaningful changes:

1. typecheck
2. lint
3. unit tests
4. relevant E2E tests

Fix failures before moving on.

## Git

Use small logical commits.

Never commit:
- `.env`
- API keys
- journal exports
- screenshots
- local DB files
- personal data

## First task

If the repo is empty, build only the foundation:
- Next.js/TypeScript
- Tailwind/UI
- navigation shell
- IndexedDB/Dexie
- schema version 1
- repository abstraction
- domain types
- calculation-service skeleton
- test setup
- dashboard shell

Do not implement AI or a server database in the first task.
