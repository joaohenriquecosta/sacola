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

   | Name                  | Value                                                       | Scope               |
   | --------------------- | ----------------------------------------------------------- | ------------------- |
   | `SESSION_COOKIE_NAME` | `sacola_session_id`                                         | Production, Preview |
   | `TZ`                  | `America/Sao_Paulo`                                         | Production, Preview |
   | `PUBLIC_ORIGIN`       | `https://sacola1.vercel.app` (your prod alias)              | Production          |
   | `EMAIL_SMTP_HOST`     | `smtp.resend.com`                                           | Production, Preview |
   | `EMAIL_SMTP_PORT`     | `465`                                                       | Production, Preview |
   | `EMAIL_SMTP_USER`     | `resend`                                                    | Production, Preview |
   | `EMAIL_SMTP_PASS`     | `re_xxxxxxxx` (Resend API key)                              | Production, Preview |
   | `EMAIL_FROM`          | `Sacola <onboarding@resend.dev>` (or your verified address) | Production, Preview |

   For the email vars, see the next section for Resend setup.

4. Click **Deploy**.

### 3a. Configure Resend (activation emails)

1. Sign up at <https://resend.com>. Free tier covers 3,000 emails/month, 100/day.
2. **API Keys** → create one, copy the `re_...` value, save it as `EMAIL_SMTP_PASS` in the Vercel project (see table above).
3. **Domain setup** — without DNS, you must send `from: onboarding@resend.dev` and you can only deliver to the email address registered on your Resend account (sandbox mode). To send to real users, add a domain (Domains → Add Domain) and update DNS records (SPF, DKIM, DMARC). Then set `EMAIL_FROM` to a verified address on that domain.
4. Local dev uses **mailpit** (started by `npm run services:up`); messages are inspectable at <http://localhost:8025>. No Resend account needed for local work.

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

The script checks registration (201 + unactivated features), that login is blocked until activation (401 with the activation message), anti-enumeration timing on bad credentials, validation 400s, and that the migrations endpoint is gated to 404 in production. The full post-activation login/logout/cookie path is exercised by integration tests in CI — the smoke runner can't reach the activation link in prod (no DB or mailbox access).

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
- **Registration succeeds but no email arrives**: check `EMAIL_SMTP_*` env vars in Vercel; verify the Resend API key is correct and the from-address is verified for the recipient domain (sandbox mode only delivers to your registered Resend email).
