// Pagamentos: registrar, listar, somar, estornar; cross-tenant; gates
// por role; pedido cancelado bloqueia novo pagamento.

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
  username: "ownerpay",
  email: "owner-pay@example.com",
  password: "ValidSenha!2026",
};
const VENDEDOR = {
  username: "vendedorpay",
  email: "vendedor-pay@example.com",
  password: "ValidSenha!2026",
};
const SEPARADOR = {
  username: "separadorpay",
  email: "separador-pay@example.com",
  password: "ValidSenha!2026",
};
const OUTSIDER = {
  username: "outsiderpay",
  email: "outsider-pay@example.com",
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
let vendedorCookie = "";
let separadorCookie = "";
let outsiderCookie = "";
let companySlug = "";
let otherCompanySlug = "";
let orderId = "";
let firstPaymentId = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();

  await registerAndActivateUser(OWNER);
  await registerAndActivateUser(VENDEDOR);
  await registerAndActivateUser(SEPARADOR);
  await registerAndActivateUser(OUTSIDER);

  ownerCookie = await login(OWNER.email, OWNER.password);
  vendedorCookie = await login(VENDEDOR.email, VENDEDOR.password);
  separadorCookie = await login(SEPARADOR.email, SEPARADOR.password);
  outsiderCookie = await login(OUTSIDER.email, OUTSIDER.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Hortifruti dos Pagamentos" }),
  });
  companySlug = (await create.json()).slug;

  const other = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
    body: JSON.stringify({ name: "Outra dos Pagamentos" }),
  });
  otherCompanySlug = (await other.json()).slug;

  await inviteAndAccept(companySlug, ownerCookie, VENDEDOR.email, "vendedor", vendedorCookie);
  await inviteAndAccept(companySlug, ownerCookie, SEPARADOR.email, "separador", separadorCookie);

  // Cliente + produto + pedido pra testar pagamentos contra
  const clientRes = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Maria" }),
  });
  const clientId = (await clientRes.json()).id;

  const prodRes = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Tomate", price_cents: 1290, unit: "kg" }),
  });
  const productId = (await prodRes.json()).id;

  const orderRes = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({
      client_id: clientId,
      items: [{ product_id: productId, quantity: 2 }], // 2 kg * 12.90 = 25.80
    }),
  });
  orderId = (await orderRes.json()).id;
});

describe("POST /orders/[id]/payments", () => {
  test("Vendedor registra primeiro pagamento (parcial)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
        body: JSON.stringify({ amount_cents: 1000, method: "dinheiro" }),
      },
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.amount_cents).toBe(1000);
    expect(body.method).toBe("dinheiro");
    firstPaymentId = body.id;
  });

  test("Separador não registra (só read)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: separadorCookie },
        body: JSON.stringify({ amount_cents: 500, method: "pix" }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Valor zero ou negativo → 400", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
        body: JSON.stringify({ amount_cents: 0, method: "pix" }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("Método inválido → 400", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
        body: JSON.stringify({ amount_cents: 500, method: "bitcoin" }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("Cross-tenant order → 404", async () => {
    // Cria pedido na outra empresa via outsider
    const clientRes2 = await fetch(`${testBaseUrl}/api/v1/companies/${otherCompanySlug}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
      body: JSON.stringify({ name: "Cliente fora" }),
    });
    const fcid = (await clientRes2.json()).id;
    const prodRes2 = await fetch(`${testBaseUrl}/api/v1/companies/${otherCompanySlug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
      body: JSON.stringify({ name: "X", price_cents: 100, unit: "un" }),
    });
    const fpid = (await prodRes2.json()).id;
    const ordRes2 = await fetch(`${testBaseUrl}/api/v1/companies/${otherCompanySlug}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
      body: JSON.stringify({ client_id: fcid, items: [{ product_id: fpid, quantity: 1 }] }),
    });
    const fOrderId = (await ordRes2.json()).id;

    // Owner da empresa-1 tenta registrar pagamento via URL da própria
    // empresa, mas com order id da outra → 404.
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${fOrderId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({ amount_cents: 1000, method: "pix" }),
      },
    );
    expect(res.status).toBe(404);
  });

  test("Pedido cancelado bloqueia novo pagamento", async () => {
    // Owner cancela pedido recém-criado (pequeno e cancela rápido)
    const cancelRes = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({ status: "cancelado" }),
      },
    );
    expect(cancelRes.status).toBe(200);

    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}/payments`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
        body: JSON.stringify({ amount_cents: 500, method: "pix" }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /orders/[id]/payments", () => {
  test("Separador (read) vê a lista de pagamentos", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}/payments`,
      { headers: { Cookie: separadorCookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});

describe("DELETE /orders/[id]/payments/[paymentId]", () => {
  test("Vendedor não estorna (só management)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}/payments/${firstPaymentId}`,
      { method: "DELETE", headers: { Cookie: vendedorCookie } },
    );
    expect(res.status).toBe(403);
  });

  test("Owner estorna", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}/payments/${firstPaymentId}`,
      { method: "DELETE", headers: { Cookie: ownerCookie } },
    );
    expect(res.status).toBe(204);
  });
});
