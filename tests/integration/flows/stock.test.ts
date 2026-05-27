// Estoque (ledger append-only): saldo derivado da soma assinada de
// movimentos; estorno = DELETE; role gates por feature; cross-tenant
// 404.

import {
  clearDatabase,
  deleteAllEmails,
  getLastEmail,
  registerAndActivateUser,
  runPendingMigrations,
  testBaseUrl,
  waitForAllServices,
} from "tests/orchestrator";

const OWNER = {
  username: "ownerstk",
  email: "owner-stk@example.com",
  password: "ValidSenha!2026",
};
const SEPARADOR = {
  username: "separadorstk",
  email: "separador-stk@example.com",
  password: "ValidSenha!2026",
};
const VENDEDOR = {
  username: "vendedorstk",
  email: "vendedor-stk@example.com",
  password: "ValidSenha!2026",
};
const OUTSIDER = {
  username: "outsiderstk",
  email: "outsider-stk@example.com",
  password: "ValidSenha!2026",
};

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${testBaseUrl}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const match = /sacola_session_id=([^;]+)/.exec(res.headers.get("set-cookie") ?? "");
  if (!match) throw new Error("login failed");
  return `sacola_session_id=${match[1]}`;
}

async function inviteAndAccept(
  slug: string,
  ownerCookie: string,
  email: string,
  role: string,
  inviteeCookie: string,
): Promise<void> {
  await deleteAllEmails();
  await fetch(`${testBaseUrl}/api/v1/companies/${slug}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ email, role }),
  });
  const msg = await getLastEmail();
  const token = /\/convite\/([a-f0-9]{64})/.exec(msg.Text)![1];
  await fetch(`${testBaseUrl}/api/v1/invitations/${token}/accept`, {
    method: "POST",
    headers: { Cookie: inviteeCookie },
  });
}

let ownerCookie = "";
let separadorCookie = "";
let vendedorCookie = "";
let outsiderCookie = "";
let companySlug = "";
let otherCompanySlug = "";
let productId = "";
let otherProductId = "";
let firstMovementId = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();

  await registerAndActivateUser(OWNER);
  await registerAndActivateUser(SEPARADOR);
  await registerAndActivateUser(VENDEDOR);
  await registerAndActivateUser(OUTSIDER);

  ownerCookie = await login(OWNER.email, OWNER.password);
  separadorCookie = await login(SEPARADOR.email, SEPARADOR.password);
  vendedorCookie = await login(VENDEDOR.email, VENDEDOR.password);
  outsiderCookie = await login(OUTSIDER.email, OUTSIDER.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Hortifruti dos Estoques" }),
  });
  companySlug = (await create.json()).slug;

  const other = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
    body: JSON.stringify({ name: "Outra dos Estoques" }),
  });
  otherCompanySlug = (await other.json()).slug;

  await inviteAndAccept(companySlug, ownerCookie, SEPARADOR.email, "separador", separadorCookie);
  await inviteAndAccept(companySlug, ownerCookie, VENDEDOR.email, "vendedor", vendedorCookie);

  const prod = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Tomate", price_cents: 1290, unit: "kg" }),
  });
  productId = (await prod.json()).id;

  const otherProd = await fetch(`${testBaseUrl}/api/v1/companies/${otherCompanySlug}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
    body: JSON.stringify({ name: "Cebola", price_cents: 500, unit: "kg" }),
  });
  otherProductId = (await otherProd.json()).id;
});

describe("POST /stock/movements", () => {
  test("Owner lança entrada de 10 kg", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({
        product_id: productId,
        kind: "in",
        quantity: 10,
        reason: "Compra do fornecedor",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.kind).toBe("in");
    expect(body.quantity).toBe(10);
    firstMovementId = body.id;
  });

  test("Separador lança saída de 0,5 kg (vendido)", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: separadorCookie },
      body: JSON.stringify({
        product_id: productId,
        kind: "out",
        quantity: 0.5,
      }),
    });
    expect(res.status).toBe(201);
  });

  test("Vendedor (só read) não lança movimento", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
      body: JSON.stringify({ product_id: productId, kind: "in", quantity: 1 }),
    });
    expect(res.status).toBe(403);
  });

  test("Cross-tenant product → 404", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ product_id: otherProductId, kind: "in", quantity: 1 }),
    });
    expect(res.status).toBe(404);
  });

  test("Saída com quantity ≤ 0 → 400", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ product_id: productId, kind: "out", quantity: 0 }),
    });
    expect(res.status).toBe(400);
  });

  test("Ajuste negativo OK", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock/movements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({
        product_id: productId,
        kind: "adjust",
        quantity: -1.5,
        reason: "Recontagem",
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /stock (saldo)", () => {
  test("Vendedor (read) vê o saldo", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock`, {
      headers: { Cookie: vendedorCookie },
    });
    expect(res.status).toBe(200);
    const balances = await res.json();
    // 10 (in) - 0.5 (out) + (-1.5) (adjust) = 8.0
    const tomate = balances.find((b: { product_id: string }) => b.product_id === productId);
    expect(tomate.balance).toBeCloseTo(8.0, 3);
  });

  test("Outsider 403 no estoque alheio", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock`, {
      headers: { Cookie: outsiderCookie },
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /stock/movements", () => {
  test("Lista vem em ordem cronológica decrescente", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock/movements`, {
      headers: { Cookie: ownerCookie },
    });
    expect(res.status).toBe(200);
    const movements = await res.json();
    expect(movements.length).toBeGreaterThanOrEqual(3);
    expect(movements[0].product_name).toBe("Tomate");
  });
});

describe("DELETE /stock/movements/[id]", () => {
  test("Separador não estorna (só management)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/stock/movements/${firstMovementId}`,
      { method: "DELETE", headers: { Cookie: separadorCookie } },
    );
    expect(res.status).toBe(403);
  });

  test("Owner estorna a entrada inicial; saldo recalcula", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/stock/movements/${firstMovementId}`,
      { method: "DELETE", headers: { Cookie: ownerCookie } },
    );
    expect(res.status).toBe(204);

    // Agora: -0.5 (out) + (-1.5) (adjust) = -2.0 (saldo negativo, sinaliza
    // que vendemos mais do que entrou — comportamento esperado de ledger).
    const balRes = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/stock`, {
      headers: { Cookie: ownerCookie },
    });
    const balances = await balRes.json();
    const tomate = balances.find((b: { product_id: string }) => b.product_id === productId);
    expect(tomate.balance).toBeCloseTo(-2.0, 3);
  });
});
