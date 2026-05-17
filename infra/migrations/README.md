# Migrations

Forward-only schema migrations powered by [node-pg-migrate](https://github.com/salsita/node-pg-migrate).

## Commands

| Command                               | What it does                                            |
| ------------------------------------- | ------------------------------------------------------- |
| `npm run migrations:create -- <name>` | Generates a new migration file (timestamp-prefixed).    |
| `npm run migrations:up:dry`           | Lists pending migrations without applying them.         |
| `npm run migrations:up`               | Runs all pending migrations against `.env.development`. |

In production / preview, migrations are applied via `POST /api/v1/migrations` (gated by `create:migration`).

## Conventions

- **Forward-only.** No `exports.down`. If a change needs to be reverted, write a new migration that undoes it.
- **One conceptual change per migration** — e.g. "create users table", "add senha_temporaria column".
- **UTC timestamps.** All `timestamptz` columns default to `now()` — `infra/database.ts` sets `SET timezone = 'UTC'` on every connection.
- File naming is auto-generated: `<unix_ms>_<name>.js`.

## See also

- `infra/database.ts` — the `query()` wrapper used at runtime
- `infra/compose.yaml` — local Postgres for development
