// Member role updates + removal. Owner is protected: cannot be demoted,
// promoted-around, or deleted via this endpoint.

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

const ALICE = {
  username: "alice",
  email: "alice@example.com",
  password: "ValidSenha!2026",
};
const BOB = {
  username: "bob",
  email: "bob@example.com",
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

let aliceCookie = "";
let bobCookie = "";
let companySlug = "";
let aliceUserId = "";
let bobUserId = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();
  await registerAndActivateUser(ALICE);
  await registerAndActivateUser(BOB);
  aliceCookie = await login(ALICE.email, ALICE.password);
  bobCookie = await login(BOB.email, BOB.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aliceCookie },
    body: JSON.stringify({ name: "Mercado da Alice" }),
  });
  companySlug = (await create.json()).slug;
  await deleteAllEmails();

  await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aliceCookie },
    body: JSON.stringify({ email: BOB.email, role: "member" }),
  });
  const email = await getLastEmail();
  const token = /\/convite\/([a-f0-9]{64})/.exec(email.Text)![1];
  await fetch(`${testBaseUrl}/api/v1/invitations/${token}/accept`, {
    method: "POST",
    headers: { Cookie: bobCookie },
  });

  // Read user IDs straight from the DB rather than threading them through the API.
  const ids = await query<{ id: string; username: string }>({
    text: "SELECT id, username FROM users WHERE username IN ($1, $2);",
    values: [ALICE.username, BOB.username],
  });
  aliceUserId = ids.rows.find((r) => r.username === ALICE.username)!.id;
  bobUserId = ids.rows.find((r) => r.username === BOB.username)!.id;
});

describe("PATCH members/[user_id]", () => {
  test("Owner promotes Bob to admin", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/${bobUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ role: "admin" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe("admin");
  });

  test("Cannot promote anyone to owner via PATCH", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/${bobUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ role: "owner" }),
    });
    expect(res.status).toBe(403);
  });

  test("Cannot demote the owner", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${aliceUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: aliceCookie },
        body: JSON.stringify({ role: "member" }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Non-admin member cannot PATCH", async () => {
    // Demote Bob back to member, then have Bob attempt to edit Alice.
    await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/${bobUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ role: "member" }),
    });
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${aliceUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: bobCookie },
        body: JSON.stringify({ role: "member" }),
      },
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE members/[user_id]", () => {
  test("Owner removes Bob", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/${bobUserId}`, {
      method: "DELETE",
      headers: { Cookie: aliceCookie },
    });
    expect(res.status).toBe(204);
  });

  test("Cannot remove the owner", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${aliceUserId}`,
      { method: "DELETE", headers: { Cookie: aliceCookie } },
    );
    expect(res.status).toBe(403);
  });
});
