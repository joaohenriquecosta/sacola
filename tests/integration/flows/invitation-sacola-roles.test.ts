// Sacola job roles (gerente/vendedor/separador/entregador) round-trip
// through the invite + accept flow and land in the membership row exactly
// as picked.

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
let companyId = "";
let companySlug = "";

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
    body: JSON.stringify({ name: "Hortifruti do Bairro" }),
  });
  const created = await create.json();
  companyId = created.id;
  companySlug = created.slug;
  await deleteAllEmails();
});

const JOB_ROLES = ["gerente", "vendedor", "separador", "entregador"] as const;

describe.each(JOB_ROLES)("Sacola role: %s", (role) => {
  const inviteeEmail = `${role}@example.com`;
  const inviteeUsername = role;

  test(`invite + accept produces membership with role=${role}`, async () => {
    const inviteRes = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ email: inviteeEmail, role }),
    });
    expect(inviteRes.status).toBe(201);

    const email = await getLastEmail();
    const token = /\/convite\/([a-f0-9]{64})/.exec(email.Text)![1];

    const accept = await fetch(`${testBaseUrl}/api/v1/invitations/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: inviteeUsername, password: "ValidSenha!2026" }),
    });
    expect(accept.status).toBe(201);

    const membership = await query<{ role: string }>({
      text: `SELECT m.role FROM memberships m JOIN users u ON u.id = m.user_id
             WHERE m.company_id = $1 AND u.username = $2;`,
      values: [companyId, inviteeUsername],
    });
    expect(membership.rows[0]?.role).toBe(role);
  });
});

describe("Invalid roles", () => {
  test("Invite with unknown role → 400", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: aliceCookie },
      body: JSON.stringify({ email: "x@example.com", role: "marketing" }),
    });
    expect(res.status).toBe(400);
  });
});
