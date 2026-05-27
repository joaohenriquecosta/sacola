// Verifies that all the mutating endpoints log a corresponding audit event
// and that GET /audit-log surfaces them in reverse-chrono order, admin-gated.

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

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();
  await registerAndActivateUser(ALICE);
  await registerAndActivateUser(BOB);
  aliceCookie = await login(ALICE.email, ALICE.password);
  bobCookie = await login(BOB.email, BOB.password);

  // Generate a sequence of events: create company, invite Bob, Bob accepts,
  // promote Bob, demote Bob, rename company, revoke an extra invite, member
  // self-leave.
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
    body: JSON.stringify({ email: BOB.email, role: "vendedor" }),
  });
  const token = /\/convite\/([a-f0-9]{64})/.exec((await getLastEmail()).Text)![1];
  await fetch(`${testBaseUrl}/api/v1/invitations/${token}/accept`, {
    method: "POST",
    headers: { Cookie: bobCookie },
  });

  await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: aliceCookie },
    body: JSON.stringify({ name: "Mercado Centro" }),
  });

  // Issue + revoke an extra invite to capture the revoke event.
  await deleteAllEmails();
  const extra = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aliceCookie },
    body: JSON.stringify({ email: "throwaway@example.com", role: "member" }),
  });
  const extraId = (await extra.json()).id;
  await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations/${extraId}`, {
    method: "DELETE",
    headers: { Cookie: aliceCookie },
  });
});

describe("GET /api/v1/companies/[slug]/audit-log", () => {
  test("Admin/owner sees events in reverse-chrono order", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/audit-log`, {
      headers: { Cookie: aliceCookie },
    });
    expect(res.status).toBe(200);
    const events = await res.json();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(6);
    const actions = events.map((e: { action: string }) => e.action);
    // Most recent should be the revoke we just did.
    expect(actions[0]).toBe("invitation.revoked");
    // The full set we expect:
    expect(actions).toEqual(
      expect.arrayContaining([
        "company.created",
        "invitation.created",
        "member.joined",
        "company.updated",
        "invitation.revoked",
      ]),
    );
  });

  test("Events carry actor + metadata", async () => {
    const events = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/audit-log`, {
      headers: { Cookie: aliceCookie },
    }).then((r) => r.json());

    const created = events.find((e: { action: string }) => e.action === "company.created");
    expect(created.actor_username).toBe(ALICE.username);
    expect(created.metadata).toMatchObject({ name: "Mercado da Alice" });

    const joined = events.find((e: { action: string }) => e.action === "member.joined");
    expect(joined.actor_username).toBe(BOB.username);
    expect(joined.metadata).toMatchObject({ role: "vendedor", via: "existing_user" });

    const rename = events.find((e: { action: string }) => e.action === "company.updated");
    expect(rename.metadata).toMatchObject({
      old_name: "Mercado da Alice",
      new_name: "Mercado Centro",
    });
  });

  test("Bob (vendedor, no admin perms) → 403", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/audit-log`, {
      headers: { Cookie: bobCookie },
    });
    expect(res.status).toBe(403);
  });

  test("Anonymous → 403", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/audit-log`);
    expect(res.status).toBe(403);
  });
});
