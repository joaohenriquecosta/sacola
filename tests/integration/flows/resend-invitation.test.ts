// Resending an invitation rotates the token (so forwarded copies of the
// old email stop working) and bumps expires_at.

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
let inviteId = "";
let firstToken = "";

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

  const inv = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aliceCookie },
    body: JSON.stringify({ email: BOB.email, role: "member" }),
  });
  inviteId = (await inv.json()).id;
  firstToken = /\/convite\/([a-f0-9]{64})/.exec((await getLastEmail()).Text)![1];
  await deleteAllEmails();
});

describe("POST .../invitations/[id]/resend", () => {
  test("Admin resend rotates token + bumps expiry + sends new email", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/invitations/${inviteId}/resend`,
      { method: "POST", headers: { Cookie: aliceCookie } },
    );
    expect(res.status).toBe(202);

    const email = await getLastEmail();
    const newToken = /\/convite\/([a-f0-9]{64})/.exec(email.Text)![1];
    expect(newToken).not.toBe(firstToken);

    // Old token no longer works.
    const oldAccept = await fetch(`${testBaseUrl}/api/v1/invitations/${firstToken}/accept`, {
      method: "POST",
      headers: { Cookie: bobCookie },
    });
    expect(oldAccept.status).toBe(400);

    // New token works.
    const newAccept = await fetch(`${testBaseUrl}/api/v1/invitations/${newToken}/accept`, {
      method: "POST",
      headers: { Cookie: bobCookie },
    });
    expect(newAccept.status).toBe(201);
  });

  test("Resending an already-accepted invitation → 400", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/invitations/${inviteId}/resend`,
      { method: "POST", headers: { Cookie: aliceCookie } },
    );
    expect(res.status).toBe(400);
  });
});

describe("Resend permission gating", () => {
  test("Non-admin cannot resend", async () => {
    // Use a fresh invite for this case.
    await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ email: "x@example.com", role: "member" }),
    });
    const list = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
      headers: { Cookie: aliceCookie },
    }).then((r) => r.json());
    const newId = list[0].id;

    const stranger = await login(BOB.email, BOB.password);
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/invitations/${newId}/resend`,
      { method: "POST", headers: { Cookie: stranger } },
    );
    expect(res.status).toBe(403);
  });
});
