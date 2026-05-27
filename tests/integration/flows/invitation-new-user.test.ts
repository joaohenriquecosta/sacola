// Alice invites someone without a sacola account. The invitee clicks the
// link → /convite/[token] → submits username + password inline → account
// is created already-activated, the membership is attached, and the
// invitee is logged in (cookie returned).

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
const INVITEE_EMAIL = "newperson@example.com";
const INVITEE_USERNAME = "newperson";
const INVITEE_PASSWORD = "BrandNewPass!2026";

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
let companySlug = "";
let inviteToken = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();
  await registerAndActivateUser(ALICE);
  aliceCookie = await login(ALICE.email, ALICE.password);

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
    body: JSON.stringify({ email: INVITEE_EMAIL, role: "member" }),
  });
  const email = await getLastEmail();
  inviteToken = /\/convite\/([a-f0-9]{64})/.exec(email.Text)![1];
});

describe("Invitation flow (no existing account)", () => {
  test("Accept with username+password creates user, attaches membership, returns cookie", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/invitations/${inviteToken}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: INVITEE_USERNAME, password: INVITEE_PASSWORD }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toMatch(/sacola_session_id=/);
    const body = await res.json();
    expect(body.slug).toBe(companySlug);

    // The freshly-created user should be able to log in immediately — no
    // separate activation email step.
    const sessionCookie = await login(INVITEE_EMAIL, INVITEE_PASSWORD);
    const profile = await fetch(`${testBaseUrl}/api/v1/user`, {
      headers: { Cookie: sessionCookie },
    });
    expect(profile.status).toBe(200);

    const members = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members`, {
      headers: { Cookie: aliceCookie },
    }).then((r) => r.json());
    const invitee = members.find((m: { username: string }) => m.username === INVITEE_USERNAME);
    expect(invitee?.role).toBe("member");
  });

  test("Accept without body fails when the invitee has no session", async () => {
    // Issue a fresh invite for the next case (the prior token was consumed).
    await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ email: "second@example.com", role: "member" }),
    });
    const email = await getLastEmail();
    const token = /\/convite\/([a-f0-9]{64})/.exec(email.Text)![1];

    const res = await fetch(`${testBaseUrl}/api/v1/invitations/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
