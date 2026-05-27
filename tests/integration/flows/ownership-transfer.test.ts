// Ownership transfer + self-leave. Two endpoints that, together, let the
// owner step away from a company they no longer want to run.

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

const ALICE = { username: "alice", email: "alice@example.com", password: "ValidSenha!2026" };
const BOB = { username: "bob", email: "bob@example.com", password: "ValidSenha!2026" };
const CARLA = { username: "carla", email: "carla@example.com", password: "ValidSenha!2026" };

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

async function acceptInviteAs(slug: string, email: string, role: string, inviterCookie: string) {
  await fetch(`${testBaseUrl}/api/v1/companies/${slug}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: inviterCookie },
    body: JSON.stringify({ email, role }),
  });
  const sent = await getLastEmail();
  const token = /\/convite\/([a-f0-9]{64})/.exec(sent.Text)![1];
  const inviteeCookie = await login(email, "ValidSenha!2026");
  await fetch(`${testBaseUrl}/api/v1/invitations/${token}/accept`, {
    method: "POST",
    headers: { Cookie: inviteeCookie },
  });
  await deleteAllEmails();
  return inviteeCookie;
}

let aliceCookie = "";
let bobCookie = "";
let carlaCookie = "";
let companySlug = "";
let companyId = "";
let aliceId = "";
let bobId = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();

  await registerAndActivateUser(ALICE);
  await registerAndActivateUser(BOB);
  await registerAndActivateUser(CARLA);
  aliceCookie = await login(ALICE.email, ALICE.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aliceCookie },
    body: JSON.stringify({ name: "Hortifruti da Alice" }),
  });
  const created = await create.json();
  companyId = created.id;
  companySlug = created.slug;
  await deleteAllEmails();

  bobCookie = await acceptInviteAs(companySlug, BOB.email, "admin", aliceCookie);
  carlaCookie = await acceptInviteAs(companySlug, CARLA.email, "member", aliceCookie);

  const ids = await query<{ id: string; username: string }>({
    text: "SELECT id, username FROM users WHERE username = ANY($1);",
    values: [[ALICE.username, BOB.username]],
  });
  aliceId = ids.rows.find((r) => r.username === ALICE.username)!.id;
  bobId = ids.rows.find((r) => r.username === BOB.username)!.id;
});

describe("Transfer ownership", () => {
  test("Non-owner (admin) cannot transfer", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: bobCookie },
      body: JSON.stringify({ user_id: aliceId }),
    });
    expect(res.status).toBe(403);
  });

  test("Owner cannot transfer to themselves", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ user_id: aliceId }),
    });
    expect(res.status).toBe(400);
  });

  test("Owner cannot transfer to a non-member", async () => {
    const stranger = await query<{ id: string }>({
      text: "SELECT id FROM users WHERE username = $1;",
      values: ["carla"],
    });
    void stranger; // carla IS a member here, so use a fabricated UUID
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ user_id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(400);
  });

  test("Alice transfers to Bob; Alice becomes admin, Bob becomes owner", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/transfer-ownership`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ user_id: bobId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.new_owner).toEqual({ user_id: bobId, role: "owner" });
    expect(body.former_owner).toEqual({ user_id: aliceId, role: "admin" });

    const roles = await query<{ user_id: string; role: string }>({
      text: "SELECT user_id, role FROM memberships WHERE company_id = $1;",
      values: [companyId],
    });
    const byUser = Object.fromEntries(roles.rows.map((r) => [r.user_id, r.role]));
    expect(byUser[aliceId]).toBe("admin");
    expect(byUser[bobId]).toBe("owner");
  });

  test("After transfer, the former owner can delete their membership via /members/me", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/me`, {
      method: "DELETE",
      headers: { Cookie: aliceCookie },
    });
    expect(res.status).toBe(204);

    const remaining = await query<{ count: string }>({
      text: "SELECT count(*)::text FROM memberships WHERE user_id = $1 AND company_id = $2;",
      values: [aliceId, companyId],
    });
    expect(Number(remaining.rows[0].count)).toBe(0);
  });
});

describe("Self-leave (/members/me)", () => {
  test("Member can leave", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/me`, {
      method: "DELETE",
      headers: { Cookie: carlaCookie },
    });
    expect(res.status).toBe(204);
  });

  test("Owner cannot leave directly — needs to transfer first", async () => {
    // Bob is the owner now (after the transfer above). Self-leave must 403.
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/me`, {
      method: "DELETE",
      headers: { Cookie: bobCookie },
    });
    expect(res.status).toBe(403);
  });

  test("Leaving an empty/unknown company is idempotent (204)", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/me`, {
      method: "DELETE",
      headers: { Cookie: carlaCookie },
    });
    expect(res.status).toBe(204);
  });
});

describe("DELETE /members/[user_id] guards", () => {
  test("Owner cannot remove themselves via the admin endpoint", async () => {
    // Bob (current owner) tries to delete their own membership via the
    // non-self path — should be sent to /members/me with 403.
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/${bobId}`, {
      method: "DELETE",
      headers: { Cookie: bobCookie },
    });
    expect(res.status).toBe(403);
  });
});
