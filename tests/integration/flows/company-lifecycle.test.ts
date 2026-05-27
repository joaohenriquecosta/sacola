// End-to-end company lifecycle: register an owner, create a company, see it
// in the list, fetch by slug, rename, delete.

import {
  clearDatabase,
  deleteAllEmails,
  registerAndActivateUser,
  runPendingMigrations,
  testBaseUrl,
  waitForAllServices,
} from "tests/orchestrator";

const OWNER = {
  username: "alice",
  email: "alice@example.com",
  password: "ValidSenha!2026",
};

let sessionCookie = "";

async function jsonRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> | Record<string, unknown>[] | null }> {
  const init: RequestInit = { method, headers: {} };
  if (sessionCookie) {
    (init.headers as Record<string, string>).Cookie = sessionCookie;
  }
  if (body !== undefined) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${testBaseUrl}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();
  await registerAndActivateUser(OWNER);

  const loginRes = await fetch(`${testBaseUrl}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER.email, password: OWNER.password }),
  });
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  const match = /sacola_session_id=([^;]+)/.exec(setCookie);
  if (!match) throw new Error(`Login failed: ${setCookie}`);
  sessionCookie = `sacola_session_id=${match[1]}`;
});

describe("Company lifecycle", () => {
  let companySlug = "";

  test("POST /api/v1/companies creates the company with the caller as owner", async () => {
    const { status, body } = await jsonRequest("POST", "/api/v1/companies", {
      name: "Mercado do João",
    });
    expect(status).toBe(201);
    const created = body as Record<string, unknown>;
    expect(created.name).toBe("Mercado do João");
    expect(created.slug).toMatch(/^mercado-do-joao$/);
    expect(created.role).toBe("owner");
    companySlug = created.slug as string;
  });

  test("Slug collisions get a numeric suffix", async () => {
    const { status, body } = await jsonRequest("POST", "/api/v1/companies", {
      name: "Mercado do João",
    });
    expect(status).toBe(201);
    expect((body as Record<string, unknown>).slug).toBe("mercado-do-joao-2");
  });

  test("GET /api/v1/companies lists the owner's companies", async () => {
    const { status, body } = await jsonRequest("GET", "/api/v1/companies");
    expect(status).toBe(200);
    const list = body as Record<string, unknown>[];
    expect(list.length).toBe(2);
    expect(list.every((c) => c.role === "owner")).toBe(true);
  });

  test("GET /api/v1/companies/[slug] returns the company with the caller's role", async () => {
    const { status, body } = await jsonRequest("GET", `/api/v1/companies/${companySlug}`);
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).slug).toBe(companySlug);
    expect((body as Record<string, unknown>).role).toBe("owner");
  });

  test("PATCH /api/v1/companies/[slug] renames", async () => {
    const { status, body } = await jsonRequest("PATCH", `/api/v1/companies/${companySlug}`, {
      name: "Sacola Centro",
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).name).toBe("Sacola Centro");
  });

  test("PATCH rejects an invalid slug", async () => {
    const { status, body } = await jsonRequest("PATCH", `/api/v1/companies/${companySlug}`, {
      slug: "Has Spaces",
    });
    expect(status).toBe(400);
    expect((body as Record<string, unknown>).name).toBe("ValidationError");
  });

  test("DELETE /api/v1/companies/[slug] removes it; subsequent GET 404s", async () => {
    const del = await jsonRequest("DELETE", `/api/v1/companies/${companySlug}`);
    expect(del.status).toBe(204);
    const get = await jsonRequest("GET", `/api/v1/companies/${companySlug}`);
    expect(get.status).toBe(404);
  });
});

describe("Anonymous users", () => {
  test("POST /api/v1/companies → 403 without session", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Should not exist" }),
    });
    expect(res.status).toBe(403);
  });

  test("GET /api/v1/companies → 401 without session", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies`);
    expect(res.status).toBe(401);
  });
});
