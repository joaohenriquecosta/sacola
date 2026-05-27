// Clients CRUD scoped per company. Vendedor diverge das outras roles
// non-management: pode criar/editar (mas não deletar). Cross-tenant
// retorna 404.

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
  username: "ownercli",
  email: "owner-cli@example.com",
  password: "ValidSenha!2026",
};
const VENDEDOR = {
  username: "vendedorcli",
  email: "vendedor-cli@example.com",
  password: "ValidSenha!2026",
};
const SEPARADOR = {
  username: "separadorcli",
  email: "separador-cli@example.com",
  password: "ValidSenha!2026",
};
const OUTSIDER = {
  username: "outsidercli",
  email: "outsider-cli@example.com",
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
let firstClientId = "";

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
    body: JSON.stringify({ name: "Hortifruti dos Clientes" }),
  });
  companySlug = (await create.json()).slug;

  const other = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
    body: JSON.stringify({ name: "Outra dos Clientes" }),
  });
  otherCompanySlug = (await other.json()).slug;

  await inviteAndAccept(companySlug, ownerCookie, VENDEDOR.email, "vendedor", vendedorCookie);
  await inviteAndAccept(companySlug, ownerCookie, SEPARADOR.email, "separador", separadorCookie);
});

describe("POST /clients", () => {
  test("Owner creates", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Maria da Silva", phone: "(11) 99999-0001" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Maria da Silva");
    expect(body.phone).toBe("(11) 99999-0001");
    firstClientId = body.id;
  });

  test("Vendedor can create (front-line role)", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
      body: JSON.stringify({ name: "Cliente novo do vendedor" }),
    });
    expect(res.status).toBe(201);
  });

  test("Separador (read-only) cannot create", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: separadorCookie },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(403);
  });

  test("Outsider cannot create on someone else's company", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(403);
  });

  test("Empty notes/phone roundtrip as null", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Sem dados extras", phone: "", notes: "" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.phone).toBeNull();
    expect(body.notes).toBeNull();
  });
});

describe("GET /clients", () => {
  test("Separador can list", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients`, {
      headers: { Cookie: separadorCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
  });

  test("Outsider gets 403 on someone else's carteira", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients`, {
      headers: { Cookie: outsiderCookie },
    });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /clients/[id]", () => {
  test("Vendedor can update", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/clients/${firstClientId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: vendedorCookie },
        body: JSON.stringify({ phone: "(11) 99999-0099" }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.phone).toBe("(11) 99999-0099");
  });

  test("Separador cannot update", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/clients/${firstClientId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: separadorCookie },
        body: JSON.stringify({ name: "x" }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Cross-tenant PATCH returns 404", async () => {
    const create = await fetch(`${testBaseUrl}/api/v1/companies/${otherCompanySlug}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
      body: JSON.stringify({ name: "Não meu" }),
    });
    const otherId = (await create.json()).id;
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/clients/${otherId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Pwned" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /clients/[id]", () => {
  test("Vendedor cannot delete (front-line não apaga cadastro)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/clients/${firstClientId}`,
      { method: "DELETE", headers: { Cookie: vendedorCookie } },
    );
    expect(res.status).toBe(403);
  });

  test("Owner deletes", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/clients/${firstClientId}`,
      { method: "DELETE", headers: { Cookie: ownerCookie } },
    );
    expect(res.status).toBe(204);

    const after = await query<{ count: string }>({
      text: `SELECT COUNT(*)::text AS count FROM clients WHERE id = $1;`,
      values: [firstClientId],
    });
    expect(after.rows[0].count).toBe("0");
  });
});
