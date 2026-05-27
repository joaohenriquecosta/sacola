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

let cookie = "";
let slug = "";

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${testBaseUrl}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = /sacola_session_id=([^;]+)/.exec(setCookie);
  if (!match) throw new Error(`Login failed: ${setCookie}`);
  return `sacola_session_id=${match[1]}`;
}

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();
  await registerAndActivateUser(OWNER);
  cookie = await login(OWNER.email, OWNER.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "Mercado do João" }),
  });
  const created = await create.json();
  slug = created.slug;
});

describe("GET /api/v1/companies/[slug]/members", () => {
  test("lists members; creator appears as owner with their username", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${slug}/members`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const members = await res.json();
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      role: "owner",
      username: OWNER.username,
    });
    // Email is intentionally NOT in the listing — admins manage roles, not
    // contact info.
    expect(members[0]).not.toHaveProperty("email");
    expect(members[0]).not.toHaveProperty("password");
  });

  test("403 for a user who isn't a member of the company", async () => {
    const stranger = {
      username: "stranger",
      email: "stranger@example.com",
      password: "ValidSenha!2026",
    };
    await registerAndActivateUser(stranger);
    const strangerCookie = await login(stranger.email, stranger.password);

    const res = await fetch(`${testBaseUrl}/api/v1/companies/${slug}/members`, {
      headers: { Cookie: strangerCookie },
    });
    expect(res.status).toBe(403);
  });
});
