# Migrations

Forward-only schema migrations powered by [node-pg-migrate](https://github.com/salsita/node-pg-migrate).

## Commands

| Command                               | What it does                                            |
| ------------------------------------- | ------------------------------------------------------- |
| `npm run migrations:create -- <name>` | Generates a new migration file (timestamp-prefixed).    |
| `npm run migrations:up:dry`           | Lists pending migrations without applying them.         |
| `npm run migrations:up`               | Runs all pending migrations against `.env.development`. |

In production and preview deploys (Vercel), migrations run during the build step via the `vercel-build` script (`node-pg-migrate up` against `DATABASE_URL_UNPOOLED`, then `next build`). Each Vercel preview gets its own Neon DB branch through the Neon-Vercel integration, so migrations are applied independently per branch.

The `POST /api/v1/migrations` endpoint is **only available in dev and test** — it returns 404 in production. It exists so the test orchestrator can re-apply migrations after `clearDatabase`; production never relies on it.

## Conventions

- **Forward-only.** No `exports.down`. If a change needs to be reverted, write a new migration that undoes it.
- **One conceptual change per migration** — e.g. "create users table", "add senha_temporaria column".
- **UTC timestamps.** All `timestamptz` columns default to `now()` — `infra/database.ts` sets `SET timezone = 'UTC'` on every connection.
- File naming is auto-generated: `<unix_ms>_<name>.js`.

## See also

- `infra/database.ts` — the `query()` wrapper used at runtime
- `infra/compose.yaml` — local Postgres for development
