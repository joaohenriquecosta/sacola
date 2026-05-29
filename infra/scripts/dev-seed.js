// Dev-only seed: fills the local DB with a rich, realistic scenario so you can
// click through the whole UI and catch bugs before pushing — two companies
// (the dev owns both), one member per role (+ a granular one), catalogs,
// clients, stock (some zeroed to trigger the low-stock alert), orders across
// every status, and payments.
//
// Reuses the real API (so user/company/order features stay correct) and only
// touches the DB to read activation/invitation tokens — the same trick the
// test orchestrator uses. Idempotent at the company level: if the first
// company already exists it assumes a previous run and just prints the logins.
//
// Requires the dev stack up (Postgres + mailpit + Next):
//
//   npm run dev        # one terminal
//   npm run dev:seed   # another
//
// Every account uses the same password; log in at /login.

require("dotenv").config({ path: ".env.development" });
const { Client } = require("pg");

const BASE_URL = process.env.DEV_SEED_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "dev-password-123"; // >= 12 chars + a special char (policy)

// One account per role so you can log in and see each role's sidebar.
const USERS = {
  dev: { username: "dev", email: "dev@example.com" },
  gerente: { username: "gerente", email: "gerente@example.com" },
  vendedor: { username: "vendedor", email: "vendedor@example.com" },
  separador: { username: "separador", email: "separador@example.com" },
  entregador: { username: "entregador", email: "entregador@example.com" },
  balcao: { username: "balcao", email: "balcao@example.com" },
  financeiro: { username: "financeiro", email: "financeiro@example.com" },
};

// Granular member: reads + can register payments, nothing else. Shows a
// custom feature set (not a named preset) in the UI.
const FINANCEIRO_FEATURES = [
  "read:company",
  "read:member",
  "read:order",
  "read:payment",
  "create:payment",
];

const COMPANY_A = {
  name: "Hortifruti Dev",
  members: [
    { key: "gerente", role: "gerente" },
    { key: "vendedor", role: "vendedor" },
    { key: "separador", role: "separador" },
    { key: "entregador", role: "entregador" },
    { key: "balcao", role: "member" },
    { key: "financeiro", role: "member", features: FINANCEIRO_FEATURES },
  ],
  products: [
    { name: "Tomate", price_cents: 1290, unit: "kg", stock: 50 },
    { name: "Alface", price_cents: 590, unit: "un", cost_cents: 250, stock: 30 },
    { name: "Banana", price_cents: 480, unit: "kg", stock: 80 },
    { name: "Cebola", price_cents: 550, unit: "kg", stock: 40 },
    { name: "Batata", price_cents: 399, unit: "kg", stock: 100 },
    { name: "Maçã", price_cents: 890, unit: "kg", stock: 0 }, // sem saldo → alerta
    { name: "Cenoura", price_cents: 450, unit: "maço", stock: 25 },
    { name: "Ovos", price_cents: 1500, unit: "dúzia", stock: 0 }, // sem saldo → alerta
  ],
  clients: [
    { name: "Maria da Silva", phone: "(11) 99999-0001" },
    { name: "João Souza", phone: "(11) 98888-0002" },
    { name: "Padaria Central", notes: "Entrega só pela manhã" },
    { name: "Dona Cleide", phone: "(11) 97777-0003" },
    { name: "Restaurante Sabor", notes: "Pedido grande às sextas" },
    { name: "Zé do Bar" },
  ],
  orders: [
    {
      client: "Maria da Silva",
      items: [
        ["Tomate", 2],
        ["Alface", 3],
      ],
      status: "criado",
      notes: "Entregar à tarde",
    },
    { client: "João Souza", items: [["Banana", 1.5]], status: "separado" },
    {
      client: "Padaria Central",
      items: [
        ["Batata", 5],
        ["Cebola", 2],
      ],
      status: "entregue",
      pays: [["full", "pix"]],
    },
    { client: "Dona Cleide", items: [["Maçã", 1]], status: "criado", pays: [[500, "dinheiro"]] },
    {
      client: "Restaurante Sabor",
      items: [
        ["Tomate", 10],
        ["Cenoura", 5],
      ],
      status: "separado",
    },
    { client: "Zé do Bar", items: [["Banana", 2]], status: "cancelado" },
    {
      client: "Maria da Silva",
      items: [["Cebola", 3]],
      status: "entregue",
      pays: [["full", "dinheiro"]],
    },
    { client: "João Souza", items: [["Alface", 1]], status: "criado" },
  ],
};

const COMPANY_B = {
  name: "Quitanda Central",
  // gerente@ is "gerente" in company A but only a "vendedor" here — shows
  // per-company roles in a multi-tenant setup.
  members: [{ key: "gerente", role: "vendedor" }],
  products: [
    { name: "Laranja", price_cents: 690, unit: "kg", stock: 60 },
    { name: "Manga", price_cents: 1190, unit: "kg", stock: 20 },
    { name: "Abacaxi", price_cents: 800, unit: "un", stock: 0 },
  ],
  clients: [{ name: "Sítio Bom", phone: "(21) 96666-0004" }, { name: "Feira Livre" }],
  orders: [
    { client: "Sítio Bom", items: [["Laranja", 4]], status: "entregue", pays: [["full", "pix"]] },
    { client: "Feira Livre", items: [["Manga", 2]], status: "criado" },
  ],
};

async function main() {
  await ensureServerUp();

  // Users first (idempotent), then a cookie for each.
  const cookies = {};
  for (const [key, user] of Object.entries(USERS)) {
    await registerAndActivate(user);
    cookies[key] = await login(user.email);
  }
  console.log(`✓ ${Object.keys(USERS).length} usuários prontos (ativados + logados)`);

  const owner = cookies.dev;

  // Company-level idempotency: bail out of data seeding if it's already there.
  const existing = await api("GET", "/api/v1/companies", null, owner);
  const seeded =
    Array.isArray(existing.body) && existing.body.some((c) => c.name === COMPANY_A.name);
  if (seeded) {
    console.log("• cenário já existia — pulando criação de dados");
    return printSummary();
  }

  await seedCompany(COMPANY_A, cookies);
  await seedCompany(COMPANY_B, cookies);
  printSummary();
}

async function seedCompany(spec, cookies) {
  const owner = cookies.dev;
  const slug = await createCompany(spec.name, owner);
  console.log(`\n● ${spec.name}  →  /${slug}`);

  for (const m of spec.members) {
    await inviteAndAccept(slug, owner, USERS[m.key].email, m.role, cookies[m.key], m.features);
  }
  console.log(`  ✓ ${spec.members.length} membro(s) convidado(s)`);

  const productIds = {};
  for (const p of spec.products) {
    const created = await postOk(`/api/v1/companies/${slug}/products`, owner, {
      name: p.name,
      price_cents: p.price_cents,
      unit: p.unit,
      ...(p.cost_cents !== undefined ? { cost_cents: p.cost_cents } : {}),
    });
    productIds[p.name] = created.id;
    if (p.stock > 0) {
      await postOk(`/api/v1/companies/${slug}/stock/movements`, owner, {
        product_id: created.id,
        kind: "in",
        quantity: p.stock,
      });
    }
  }
  console.log(`  ✓ ${spec.products.length} produtos (+ estoque inicial)`);

  const clientIds = {};
  for (const c of spec.clients) {
    const created = await postOk(`/api/v1/companies/${slug}/clients`, owner, c);
    clientIds[c.name] = created.id;
  }
  console.log(`  ✓ ${spec.clients.length} clientes`);

  for (const o of spec.orders) {
    const order = await postOk(`/api/v1/companies/${slug}/orders`, owner, {
      client_id: clientIds[o.client],
      items: o.items.map(([name, quantity]) => ({ product_id: productIds[name], quantity })),
      ...(o.notes ? { notes: o.notes } : {}),
    });
    await applyStatus(slug, owner, order.id, o.status);
    for (const [amount, method] of o.pays ?? []) {
      await postOk(`/api/v1/companies/${slug}/orders/${order.id}/payments`, owner, {
        amount_cents: amount === "full" ? order.total_cents : amount,
        method,
      });
    }
  }
  console.log(`  ✓ ${spec.orders.length} pedidos (status variados + pagamentos)`);
}

// criado → separado → entregue, or → cancelado. Owner holds every transition.
async function applyStatus(slug, cookie, orderId, target) {
  if (target === "criado") return;
  if (target === "cancelado") return transition(slug, cookie, orderId, "cancelado");
  await transition(slug, cookie, orderId, "separado");
  if (target === "entregue") await transition(slug, cookie, orderId, "entregue");
}

async function transition(slug, cookie, orderId, status) {
  const res = await api("PATCH", `/api/v1/companies/${slug}/orders/${orderId}`, { status }, cookie);
  if (res.status !== 200) {
    throw new Error(`transição → ${status} falhou (${res.status}): ${JSON.stringify(res.body)}`);
  }
}

// --- account helpers ---

async function registerAndActivate(user) {
  await api("POST", "/api/v1/users", { ...user, password: PASSWORD });
  await activateIfPending(user.email);
}

// PATCHes the pending activation token (no-op if already activated). Heals a
// half-finished previous run too. Mirrors the test orchestrator.
async function activateIfPending(email) {
  const token = await scalar(
    `SELECT t.token FROM user_activation_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE LOWER(u.email) = LOWER($1) AND t.used_at IS NULL
        AND t.expires_at > now()
      ORDER BY t.created_at DESC LIMIT 1`,
    [email],
  );
  if (!token) return;
  const res = await api("PATCH", `/api/v1/activations/${token}`);
  if (res.status !== 200) {
    throw new Error(`ativação de ${email} falhou (${res.status}): ${JSON.stringify(res.body)}`);
  }
}

async function login(email) {
  const res = await api("POST", "/api/v1/sessions", { email, password: PASSWORD });
  if (res.status !== 201 || !res.cookie) {
    throw new Error(`login de ${email} falhou (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.cookie;
}

async function createCompany(name, ownerCookie) {
  const res = await api("POST", "/api/v1/companies", { name }, ownerCookie);
  if (res.status !== 201) {
    throw new Error(`criar empresa "${name}" falhou (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.slug;
}

async function inviteAndAccept(slug, ownerCookie, email, role, inviteeCookie, features) {
  const invite = await api(
    "POST",
    `/api/v1/companies/${slug}/invitations`,
    { email, role, ...(features ? { features } : {}) },
    ownerCookie,
  );
  if (invite.status !== 201) {
    throw new Error(
      `convite de ${email} falhou (${invite.status}): ${JSON.stringify(invite.body)}`,
    );
  }
  const token = await scalar(
    `SELECT token FROM invitations
      WHERE LOWER(email) = LOWER($1) AND accepted_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  if (!token) throw new Error(`sem convite pendente para ${email}`);
  const accept = await api("POST", `/api/v1/invitations/${token}/accept`, null, inviteeCookie);
  if (accept.status !== 200 && accept.status !== 201) {
    throw new Error(`aceite de ${email} falhou (${accept.status}): ${JSON.stringify(accept.body)}`);
  }
}

// --- low-level helpers ---

async function postOk(path, cookie, body) {
  const res = await api("POST", path, body, cookie);
  if (res.status !== 201) {
    throw new Error(`POST ${path} falhou (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body;
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
    // No JSON body — fine.
  }
  return { status: response.status, body: parsed, cookie: cookieHeader || undefined };
}

// Runs a single-column query and returns the first cell. SET timezone='UTC' so
// the token expiry comparisons behave like the orchestrator's UTC session.
async function scalar(text, values) {
  const client = new Client(pgParams());
  await client.connect();
  try {
    await client.query("SET timezone = 'UTC'");
    const { rows } = await client.query(text, values);
    return rows[0] ? Object.values(rows[0])[0] : undefined;
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
  const line = "─".repeat(56);
  const accounts = Object.entries(USERS).map(([key, u]) => `    ${u.email.padEnd(24)} (${key})`);
  console.log(
    [
      "",
      line,
      `  Pronto! Faça login em ${BASE_URL}/login`,
      `  Senha de todos: ${PASSWORD}`,
      "",
      "  Contas (cada uma mostra a navegação do seu papel):",
      ...accounts,
      "",
      `  Empresas (dev é dono das duas): ${COMPANY_A.name} e ${COMPANY_B.name}`,
      "  Mailpit (convites/ativações): http://localhost:8025",
      line,
      "",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(`\n✗ ${err.message}\n`);
  process.exit(1);
});
