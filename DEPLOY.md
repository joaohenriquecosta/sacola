# Deploying sacola

Production runs on **Vercel** (Next.js host) + **Neon** (managed Postgres). Preview deploys (any branch other than `main`) get their own isolated Neon database branch via the [Neon-Vercel integration](https://vercel.com/integrations/neon).

## One-time setup

### 1. Create the Neon project

1. Sign in at <https://console.neon.tech> and create a project named `sacola`.
2. Use Postgres 16 and the AWS region closest to your users (`aws-sa-east-1` for Brazil, `aws-us-east-1` otherwise).
3. Note the project — credentials are wired up automatically in the next step.

### 2. Install the Neon-Vercel integration

1. Go to <https://vercel.com/integrations/neon> and click **Add Integration**.
2. Authorize Vercel to access your Neon account and pick the `sacola` Neon project.
3. When the **Install Integration** dialog opens, configure as follows:

   | Field                                     | Value                                                                              |
   | ----------------------------------------- | ---------------------------------------------------------------------------------- |
   | **Project**                               | `sacola` (your Vercel project — pick it once it exists, or come back after step 3) |
   | **Environments → Production**             | ✅                                                                                 |
   | **Environments → Preview**                | ✅                                                                                 |
   | **Environments → Development**            | ❌ (local dev uses Docker, not Neon)                                               |
   | **Create database branch for Production** | ❌ (prod must keep pointing at the Neon `main` branch)                             |
   | **Create database branch for Preview**    | ✅ (each preview gets a fresh isolated branch, auto-deleted with the preview)      |
   | **Custom Prefix**                         | `DATABASE` → generates `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, etc.               |
   | **Sensitive**                             | Off                                                                                |

   This is the critical step. The prefix must be `DATABASE` so the runtime picks up `DATABASE_URL` (pooled) and the build picks up `DATABASE_URL_UNPOOLED` (direct, used by `node-pg-migrate`).

### 3. Import the repo into Vercel

1. <https://vercel.com/new> → **Import Git Repository** → `joaohenriquecosta/sacola`.
2. Framework preset: **Next.js** (auto-detected).
3. **Environment Variables** — the Neon integration already populated the database vars. Add these by hand:

   | Name                  | Value               | Scope               |
   | --------------------- | ------------------- | ------------------- |
   | `SESSION_COOKIE_NAME` | `sacola_session_id` | Production, Preview |
   | `TZ`                  | `America/Sao_Paulo` | Production, Preview |

4. Click **Deploy**.

### 4. Verify with the smoke script

If **Vercel Deployment Protection** is on for the project (default on the Pro plan), create a bypass secret first: Project Settings → Deployment Protection → **Protection Bypass for Automation** → Add Secret. Save the value as `VERCEL_AUTOMATION_BYPASS_SECRET` in your shell. Then:

```sh
VERCEL_AUTOMATION_BYPASS_SECRET=<secret> \
  ./infra/scripts/smoke-prod.sh https://<your-project>.vercel.app
```

If Deployment Protection is off, omit the env var:

```sh
./infra/scripts/smoke-prod.sh https://<your-project>.vercel.app
```

The script checks the golden path (register → login → user → logout), anti-enumeration timing on bad credentials, validation 400s, and that migrations applied (`GET /api/v1/migrations` returns `[]`). All checks must pass before merging the next feature.

## How deploys work

- **Push to `main`** → production deploy. `vercel-build` runs migrations against `DATABASE_URL_UNPOOLED` on the Neon `main` branch, then `next build`. Runtime queries use `DATABASE_URL` (pooled).
- **Push to any other branch / open a PR** → preview deploy. The Neon-Vercel integration auto-creates a Neon DB branch from `main`. `vercel-build` applies migrations on that branch (isolated from prod). The preview URL is reported on the PR.
- **Preview deleted / PR merged** → Neon branch is auto-deleted.

This means each PR can ship migrations without risk to production data, and you can smoke-test the preview URL before merging.

## Troubleshooting

- **Build fails at `node-pg-migrate up`**: usually means `DATABASE_URL_UNPOOLED` isn't set. Check the integration is installed and the prefix is `DATABASE` (not the default `STORAGE`).
- **Runtime 500s with "Erro na conexão com o Banco de Dados"**: `DATABASE_URL` missing or wrong. Verify the var is set in the Vercel project's env, not just the integration's.
- **Smoke script reports anti-timing failure**: `dummy bcrypt` may not be firing on the missing-user path — check `models/authentication.ts` was deployed.
- **Cookie missing `Secure`**: only set when `NODE_ENV === "production"`. If the preview is `http://`, the test will warn — but Vercel previews are always HTTPS, so this should never happen in practice.
