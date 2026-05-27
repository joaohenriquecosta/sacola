// A invites B (who already has an account) — B receives the email, logs in,
// accepts the invite, and shows up as a member with the role A picked.

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
let inviteToken = "";

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
});

describe("Invitation flow (existing user)", () => {
  test("Alice sends an invite to Bob", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ email: BOB.email, role: "admin" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe(BOB.email);
    expect(body.role).toBe("admin");
    expect(body.token).toBeUndefined();

    const email = await getLastEmail();
    expect(email.To[0].Address).toBe(BOB.email);
    const match = /\/convite\/([a-f0-9]{64})/.exec(email.Text);
    expect(match).not.toBeNull();
    inviteToken = match![1];
  });

  test("GET /invitations/[token] returns the public view", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/invitations/${inviteToken}`);
    expect(res.status).toBe(200);
    const view = await res.json();
    expect(view.email).toBe(BOB.email);
    expect(view.role).toBe("admin");
    expect(view.company.slug).toBe(companySlug);
    expect(view.invited_by.username).toBe(ALICE.username);
  });

  test("Bob accepts and becomes an admin member", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/invitations/${inviteToken}/accept`, {
      method: "POST",
      headers: { Cookie: bobCookie },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe(companySlug);
  });

  test("Members list shows Bob as admin; invite no longer pending", async () => {
    const members = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members`, {
      headers: { Cookie: aliceCookie },
    }).then((r) => r.json());
    const bob = members.find((m: { username: string }) => m.username === BOB.username);
    expect(bob?.role).toBe("admin");

    const pending = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
      headers: { Cookie: aliceCookie },
    }).then((r) => r.json());
    expect(pending).toHaveLength(0);
  });
});

describe("Invitation edge cases", () => {
  test("Re-accepting an already-consumed invitation → 400", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/invitations/${inviteToken}/accept`, {
      method: "POST",
      headers: { Cookie: bobCookie },
    });
    expect(res.status).toBe(400);
  });
});
