// Pedidos: criação atômica com itens, listagem, transição de status,
// exclusão, e cross-tenant guard (cliente/produto da empresa A em pedido
// da empresa B → 404).

import { query } from "infra/database";
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
  username: "ownerord",
  email: "owner-ord@example.com",
  password: "ValidSenha!2026",
};
const VENDEDOR = {
  username: "vendedorord",
  email: "vendedor-ord@example.com",
  password: "ValidSenha!2026",
};
const SEPARADOR = {
  username: "separadorord",
  email: "separador-ord@example.com",
  password: "ValidSenha!2026",
};
const MEMBER = {
  username: "memberord",
  email: "member-ord@example.com",
  password: "ValidSenha!2026",
};
const OUTSIDER = {
  username: "outsiderord",
  email: "outsider-ord@example.com",
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
let memberCookie = "";
let outsiderCookie = "";
let companySlug = "";
let otherCompanySlug = "";
let clientId = "";
let productId = "";
let otherProductId = "";
let firstOrderId = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();

  await registerAndActivateUser(OWNER);
  await registerAndActivateUser(VENDEDOR);
  await registerAndActivateUser(SEPARADOR);
  await registerAndActivateUser(MEMBER);
  await registerAndActivateUser(OUTSIDER);

  ownerCookie = await login(OWNER.email, OWNER.password);
  vendedorCookie = await login(VENDEDOR.email, VENDEDOR.password);
  separadorCookie = await login(SEPARADOR.email, SEPARADOR.password);
  memberCookie = await login(MEMBER.email, MEMBER.password);
  outsiderCookie = await login(OUTSIDER.email, OUTSIDER.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Hortifruti dos Pedidos" }),
  });
  companySlug = (await create.json()).slug;

  const other = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
    body: JSON.stringify({ name: "Outra dos Pedidos" }),
  });
  otherCompanySlug = (await other.json()).slug;

  await inviteAndAccept(companySlug, ownerCookie, VENDEDOR.email, "vendedor", vendedorCookie);
  await inviteAndAccept(companySlug, ownerCookie, SEPARADOR.email, "separador", separadorCookie);
  await inviteAndAccept(companySlug, ownerCookie, MEMBER.email, "member", memberCookie);

  // Cliente
  const clientRes = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Maria" }),
  });
  clientId = (await clientRes.json()).id;

  // Produto na empresa do owner
  const prodRes = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Tomate", price_cents: 1290, unit: "kg" }),
  });
  productId = (await prodRes.json()).id;

  // Produto na empresa do outsider (cross-tenant)
  const otherProdRes = await fetch(`${testBaseUrl}/api/v1/companies/${otherCompanySlug}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
    body: JSON.stringify({ name: "Não meu", price_cents: 100, unit: "un" }),
  });
  otherProductId = (await otherProdRes.json()).id;
});

describe("POST /orders", () => {
  test("Vendedor cria pedido com 2 itens, total recomputado server-side", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
      body: JSON.stringify({
        client_id: clientId,
        items: [
          { product_id: productId, quantity: 0.5 },
          { product_id: productId, quantity: 1 },
        ],
        notes: "Entregar à tarde",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    // 1290 * 0.5 = 645, 1290 * 1 = 1290, total 1935
    expect(body.total_cents).toBe(1935);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].product_name).toBe("Tomate");
    expect(body.items[0].unit_price_cents).toBe(1290);
    expect(body.status).toBe("criado");
    firstOrderId = body.id;
  });

  test("Member (read-only) não cria pedido", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: memberCookie },
      body: JSON.stringify({
        client_id: clientId,
        items: [{ product_id: productId, quantity: 1 }],
      }),
    });
    expect(res.status).toBe(403);
  });

  test("Cross-tenant product → 404", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
      body: JSON.stringify({
        client_id: clientId,
        items: [{ product_id: otherProductId, quantity: 1 }],
      }),
    });
    expect(res.status).toBe(404);
  });

  test("Quantidade negativa rejeitada", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
      body: JSON.stringify({
        client_id: clientId,
        items: [{ product_id: productId, quantity: -1 }],
      }),
    });
    expect(res.status).toBe(400);
  });

  test("Itens vazios rejeitados", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
      body: JSON.stringify({ client_id: clientId, items: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /orders + /orders/[id]", () => {
  test("Member lê lista (com client_name + item_count)", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders`, {
      headers: { Cookie: memberCookie },
    });
    expect(res.status).toBe(200);
    const list = await res.json();
    const item = list.find((o: { id: string }) => o.id === firstOrderId);
    expect(item.client_name).toBe("Maria");
    expect(item.item_count).toBe(2);
  });

  test("Detalhe inclui itens (snapshot do produto)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      { headers: { Cookie: memberCookie } },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].product_name).toBe("Tomate");
  });

  test("Outsider não vê detalhe (cross-tenant 403)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      { headers: { Cookie: outsiderCookie } },
    );
    expect(res.status).toBe(403);
  });
});

describe("PATCH /orders/[id] (transition matrix + per-transition features)", () => {
  // firstOrderId começa em 'criado'.

  test("Vendedor não pode separar (não tem transition:order:separar)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
        body: JSON.stringify({ status: "separado" }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Separador transita criado → separado", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: separadorCookie },
        body: JSON.stringify({ status: "separado" }),
      },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("separado");
  });

  test("Separador não pode entregar (transition exige feature do entregador)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: separadorCookie },
        body: JSON.stringify({ status: "entregue" }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Owner entrega (management tem todas as transições)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({ status: "entregue" }),
      },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("entregue");
  });

  test("Transição inválida (criado → entregue) → 400", async () => {
    const create = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
      body: JSON.stringify({
        client_id: clientId,
        items: [{ product_id: productId, quantity: 1 }],
      }),
    });
    const orderId = (await create.json()).id;
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ status: "entregue" }),
    });
    expect(res.status).toBe(400);
  });

  test("Vendedor cancela próprio pedido recém-criado", async () => {
    const create = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
      body: JSON.stringify({
        client_id: clientId,
        items: [{ product_id: productId, quantity: 2 }],
      }),
    });
    const orderId = (await create.json()).id;
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
      body: JSON.stringify({ status: "cancelado" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("cancelado");
  });

  test("Tentar voltar pra criado → 400 (não é alvo de transição)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({ status: "criado" }),
      },
    );
    expect(res.status).toBe(400);
  });

  test("Status inválido → 400", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({ status: "estranho" }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /orders/[id]", () => {
  test("Member não exclui", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      { method: "DELETE", headers: { Cookie: memberCookie } },
    );
    expect(res.status).toBe(403);
  });

  test("Owner exclui pedido + itens cascade", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/orders/${firstOrderId}`,
      { method: "DELETE", headers: { Cookie: ownerCookie } },
    );
    expect(res.status).toBe(204);

    const remaining = await query<{ count: string }>({
      text: `SELECT COUNT(*)::text AS count FROM order_items WHERE order_id = $1;`,
      values: [firstOrderId],
    });
    expect(remaining.rows[0].count).toBe("0");
  });
});
