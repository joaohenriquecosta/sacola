// Dev-only shortcut: creates an activated user + a company so you can log in
// and poke at the UI without the register → email → activate dance. Idempotent
// — rerun freely. Reuses the real API (so user/company features stay correct)
// and only touches the DB to read the activation token, the same trick the
// test orchestrator uses.
//
// Requires the dev stack up (Postgres + Next):
//
//   npm run dev        # in one terminal
//   npm run dev:seed   # in another
//
// Then log in at /login with the printed credentials.

require("dotenv").config({ path: ".env.development" });
const { Client } = require("pg");

const BASE_URL = process.env.DEV_SEED_BASE_URL ?? "http://localhost:3000";

const USER = {
  username: "dev",
  email: "dev@example.com",
  password: "dev-password-123", // >= 12 chars + a special char (policy)
};
const COMPANY = { name: "Hortifruti Dev", slug: "hortifruti-dev" };

async function main() {
  await ensureServerUp();

  // 1. Register the user. A non-201 here is usually just "already exists" from
  //    a previous run; the login below is the real check, so we surface the
  //    register error only if the login then fails.
  const register = await api("POST", "/api/v1/users", USER);
  console.log(
    register.status === 201
      ? `✓ usuário criado: ${USER.email}`
      : `• usuário já existia (registro retornou ${register.status})`,
  );

  // Activate via the pending token (no-op if already activated). Runs on both
  // paths so a half-finished previous run (created but not activated) heals.
  if (await activateIfPending(USER.email)) console.log("✓ usuário ativado");

  // 2. Log in → grab the session cookie. This is the source of truth.
  const login = await api("POST", "/api/v1/sessions", {
    email: USER.email,
    password: USER.password,
  });
  if (login.status !== 201) {
    const hint =
      register.status !== 201
        ? ` (o registro também falhou: ${JSON.stringify(register.body)})`
        : "";
    throw new Error(`login falhou (${login.status}): ${JSON.stringify(login.body)}${hint}`);
  }

  // 3. Create the company as that user (ignore "slug already in use").
  const company = await api("POST", "/api/v1/companies", COMPANY, login.cookie);
  if (company.status === 201) {
    console.log(`✓ empresa criada: /${COMPANY.slug}`);
  } else {
    console.log(`• empresa já existia (ou slug em uso): /${COMPANY.slug}`);
  }

  printSummary();
}

// Reads the pending activation token straight from the DB and PATCHes it,
// skipping the email — same trick as getActivationTokenForUserEmail in the
// test orchestrator. Returns false (no-op) when there's no pending token (e.g.
// already activated). SET timezone='UTC' so the expiry comparison behaves like
// the orchestrator's, which runs its session in UTC.
async function activateIfPending(email) {
  const client = new Client(pgParams());
  await client.connect();
  try {
    await client.query("SET timezone = 'UTC'");
    const { rows } = await client.query(
      `SELECT t.token
         FROM user_activation_tokens t
         JOIN users u ON u.id = t.user_id
        WHERE LOWER(u.email) = LOWER($1)
          AND t.used_at IS NULL
          AND t.expires_at > timezone('utc', now())
        ORDER BY t.created_at DESC
        LIMIT 1`,
      [email],
    );
    const token = rows[0]?.token;
    if (!token) return false;
    const activation = await api("PATCH", `/api/v1/activations/${token}`);
    if (activation.status !== 200) {
      throw new Error(`ativação falhou (${activation.status}): ${JSON.stringify(activation.body)}`);
    }
    return true;
  } finally {
    await client.end();
  }
}

function pgParams() {
  return {
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    ssl: false,
  };
}

async function api(method, path, body, cookie) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    // No JSON body (e.g. empty response) — fine.
  }

  return { status: response.status, body: parsed, cookie: cookieHeader || undefined };
}

async function ensureServerUp() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/status`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    throw new Error(
      `Dev server não respondeu em ${BASE_URL} (${err.message}). ` +
        `Rode "npm run dev" primeiro (ou ajuste DEV_SEED_BASE_URL).`,
    );
  }
}

function printSummary() {
  const line = "─".repeat(48);
  console.log(
    [
      "",
      line,
      "  Pronto! Faça login em:",
      `    ${BASE_URL}/login`,
      "",
      "  Credenciais:",
      `    email: ${USER.email}`,
      `    senha: ${USER.password}`,
      "",
      `  Empresa: ${COMPANY.name}  →  ${BASE_URL}/app/${COMPANY.slug}`,
      line,
      "  Para testar outros papéis: Equipe → Convidar.",
      "  Os emails de convite aparecem no Mailpit: http://localhost:8025",
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
});
