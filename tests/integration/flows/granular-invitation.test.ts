// Granular invitations: the inviter can pick a custom feature set when
// sending. The invitation row stores it; on accept, those exact features
// land on the new membership (not re-derived from the role preset).
//
// Server sanitizes too — closes dependency set, drops non-assignable
// features (delete:company). The accepted membership reflects the
// sanitized version.

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

const OWNER = {
  username: "ownergi",
  email: "owner-gi@example.com",
  password: "ValidSenha!2026",
};
const INVITEE = {
  username: "inviteegi",
  email: "invitee-gi@example.com",
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

let ownerCookie = "";
let inviteeCookie = "";
let companySlug = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();

  await registerAndActivateUser(OWNER);
  await registerAndActivateUser(INVITEE);
  ownerCookie = await login(OWNER.email, OWNER.password);
  inviteeCookie = await login(INVITEE.email, INVITEE.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Granular Invite Co" }),
  });
  companySlug = (await create.json()).slug;
});

describe("POST /invitations with { features }", () => {
  test("Stores the sanitized feature list on the invitation", async () => {
    await deleteAllEmails();
    const res = await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({
        email: INVITEE.email,
        role: "member",
        features: ["create:invitation", "delete:company"],
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    // delete:company stripped (non-assignable); read:invitation pulled in
    // by create:invitation's `requires`.
    expect(body.features).not.toContain("delete:company");
    expect(body.features).toContain("create:invitation");
    expect(body.features).toContain("read:invitation");
  });

  test("Membership inherits the invitation's features on accept", async () => {
    const email = await getLastEmail();
    const token = /\/convite\/([a-f0-9]{64})/.exec(email.Text)![1];
    const accept = await fetch(`${testBaseUrl}/api/v1/invitations/${token}/accept`, {
      method: "POST",
      headers: { Cookie: inviteeCookie },
    });
    expect(accept.status).toBe(201);

    const result = await query<{ features: string[]; role: string }>({
      text: `
        SELECT m.features, m.role
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE u.email = $1 AND m.company_id = (SELECT id FROM companies WHERE slug = $2)
      ;`,
      values: [INVITEE.email, companySlug],
    });
    expect(result.rows[0].role).toBe("member");
    expect(result.rows[0].features).toContain("create:invitation");
    expect(result.rows[0].features).toContain("read:invitation");
    expect(result.rows[0].features).not.toContain("delete:company");
  });

  test("Omitting features falls back to the role preset", async () => {
    // Use a second company so we don't collide with the existing membership.
    const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ name: "Preset Default Co" }),
    });
    const slug = (await create.json()).slug;

    const SECOND_INVITEE = {
      username: "preseter",
      email: "preseter@example.com",
      password: "ValidSenha!2026",
    };
    await registerAndActivateUser(SECOND_INVITEE);

    const res = await fetch(`${testBaseUrl}/api/v1/companies/${slug}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ email: SECOND_INVITEE.email, role: "admin" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    // Admin preset: every owner feature except delete:company.
    expect(body.features).toEqual(
      expect.arrayContaining([
        "read:company",
        "update:company",
        "read:member",
        "update:member",
        "delete:member",
        "read:invitation",
        "create:invitation",
        "delete:invitation",
        "read:audit_log",
      ]),
    );
    expect(body.features).not.toContain("delete:company");
  });
});
