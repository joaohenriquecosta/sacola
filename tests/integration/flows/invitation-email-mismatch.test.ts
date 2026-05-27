// A session for X cannot consume an invite addressed to Y. Defense against
// stealing/forwarded tokens.

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
const CHARLIE = {
  username: "charlie",
  email: "charlie@example.com",
  password: "ValidSenha!2026",
};
const INVITED_EMAIL = "intended@example.com";

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

let charlieCookie = "";
let inviteToken = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();
  await registerAndActivateUser(ALICE);
  await registerAndActivateUser(CHARLIE);
  const aliceCookie = await login(ALICE.email, ALICE.password);
  charlieCookie = await login(CHARLIE.email, CHARLIE.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aliceCookie },
    body: JSON.stringify({ name: "Mercado da Alice" }),
  });
  const slug = (await create.json()).slug;
  await deleteAllEmails();

  await fetch(`${testBaseUrl}/api/v1/companies/${slug}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: aliceCookie },
    body: JSON.stringify({ email: INVITED_EMAIL, role: "member" }),
  });
  const email = await getLastEmail();
  inviteToken = /\/convite\/([a-f0-9]{64})/.exec(email.Text)![1];
});

test("Logged in as Charlie, accept-an-invite-for-someone-else → 403", async () => {
  const res = await fetch(`${testBaseUrl}/api/v1/invitations/${inviteToken}/accept`, {
    method: "POST",
    headers: { Cookie: charlieCookie },
  });
  expect(res.status).toBe(403);
});
