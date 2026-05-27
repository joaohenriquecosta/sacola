// Products CRUD scoped per company. Owners create/list/update/delete;
// non-management roles read only; cross-tenant access returns 404 to avoid
// leaking existence.

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
  username: "ownerprod",
  email: "owner-prod@example.com",
  password: "ValidSenha!2026",
};
const MEMBER = {
  username: "memberprod",
  email: "member-prod@example.com",
  password: "ValidSenha!2026",
};
const OUTSIDER = {
  username: "outsiderprod",
  email: "outsider-prod@example.com",
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

let ownerCookie = "";
let memberCookie = "";
let outsiderCookie = "";
let companySlug = "";
let otherCompanySlug = "";
let firstProductId = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();

  await registerAndActivateUser(OWNER);
  await registerAndActivateUser(MEMBER);
  await registerAndActivateUser(OUTSIDER);
  ownerCookie = await login(OWNER.email, OWNER.password);
  memberCookie = await login(MEMBER.email, MEMBER.password);
  outsiderCookie = await login(OUTSIDER.email, OUTSIDER.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Hortifruti do Owner" }),
  });
  companySlug = (await create.json()).slug;

  // Outsider creates a separate company so we can test cross-tenant isolation.
  const other = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
    body: JSON.stringify({ name: "Outra Empresa" }),
  });
  otherCompanySlug = (await other.json()).slug;

  // Member joins the owner's company as a plain member (read-only on products).
  await deleteAllEmails();
  await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ email: MEMBER.email, role: "member" }),
  });
  const email = await getLastEmail();
  const token = /\/convite\/([a-f0-9]{64})/.exec(email.Text)![1];
  await fetch(`${testBaseUrl}/api/v1/invitations/${token}/accept`, {
    method: "POST",
    headers: { Cookie: memberCookie },
  });
});

describe("POST /products", () => {
  test("Owner creates a product", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Tomate italiano", price_cents: 1290, unit: "kg" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Tomate italiano");
    expect(body.price_cents).toBe(1290);
    expect(body.unit).toBe("kg");
    firstProductId = body.id;
  });

  test("Member (read-only) cannot create", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: memberCookie },
      body: JSON.stringify({ name: "X", price_cents: 100, unit: "un" }),
    });
    expect(res.status).toBe(403);
  });

  test("Outsider cannot create on someone else's company", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
      body: JSON.stringify({ name: "X", price_cents: 100, unit: "un" }),
    });
    expect(res.status).toBe(403);
  });

  test("Validates negative price", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Negative", price_cents: -1, unit: "un" }),
    });
    expect(res.status).toBe(400);
  });

  test("Stores cost_cents when provided", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Alface", price_cents: 590, cost_cents: 250, unit: "un" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.cost_cents).toBe(250);
  });

  test("Defaults cost_cents to 0 when omitted", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Banana", price_cents: 480, unit: "kg" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.cost_cents).toBe(0);
  });

  test("Validates negative cost", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "X", price_cents: 100, cost_cents: -1, unit: "un" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /products", () => {
  test("Member can list", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
      headers: { Cookie: memberCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.find((p: { id: string }) => p.id === firstProductId)).toBeTruthy();
  });

  test("Outsider gets 403 on someone else's catalog", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products`, {
      headers: { Cookie: outsiderCookie },
    });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /products/[id]", () => {
  test("Owner updates name + price", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/products/${firstProductId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({ name: "Tomate italiano orgânico", price_cents: 1490 }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Tomate italiano orgânico");
    expect(body.price_cents).toBe(1490);
  });

  test("Owner updates cost without touching price", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/products/${firstProductId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({ cost_cents: 800 }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cost_cents).toBe(800);
    expect(body.price_cents).toBe(1490);
  });

  test("Member cannot update", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/products/${firstProductId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: memberCookie },
        body: JSON.stringify({ name: "x" }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Patching a product owned by another company returns 404", async () => {
    // Outsider's own company is empty; create a product there.
    const create = await fetch(`${testBaseUrl}/api/v1/companies/${otherCompanySlug}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: outsiderCookie },
      body: JSON.stringify({ name: "Não meu", price_cents: 500, unit: "un" }),
    });
    const otherId = (await create.json()).id;

    // Owner tries to edit that product through their own company's URL.
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/products/${otherId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Pwned" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /products/[id]", () => {
  test("Member cannot delete", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/products/${firstProductId}`,
      { method: "DELETE", headers: { Cookie: memberCookie } },
    );
    expect(res.status).toBe(403);
  });

  test("Owner deletes", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/products/${firstProductId}`,
      { method: "DELETE", headers: { Cookie: ownerCookie } },
    );
    expect(res.status).toBe(204);

    const after = await query<{ count: string }>({
      text: `SELECT COUNT(*)::text AS count FROM products WHERE id = $1;`,
      values: [firstProductId],
    });
    expect(after.rows[0].count).toBe("0");
  });
});
