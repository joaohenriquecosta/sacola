// Granular permissions flow: PATCH /members/[user_id] accepts a `features`
// payload. Owner can edit any non-owner. Admin can edit non-management
// members but not other admins or the owner. delete:company never lands on
// a membership through this route. Dependencies close themselves on the
// server side (sanitizeFeatures).

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

const OWNER_USER = {
  username: "owneruser",
  email: "owner@example.com",
  password: "ValidSenha!2026",
};
const ADMIN_USER = {
  username: "adminuser",
  email: "admin@example.com",
  password: "ValidSenha!2026",
};
const ADMIN2_USER = {
  username: "adminuser2",
  email: "admin2@example.com",
  password: "ValidSenha!2026",
};
const MEMBER_USER = {
  username: "memberuser",
  email: "member@example.com",
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

async function inviteAndAccept(
  slug: string,
  ownerCookie: string,
  inviteeEmail: string,
  role: string,
  inviteeCookie: string,
): Promise<void> {
  await deleteAllEmails();
  await fetch(`${testBaseUrl}/api/v1/companies/${slug}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ email: inviteeEmail, role }),
  });
  const email = await getLastEmail();
  const token = /\/convite\/([a-f0-9]{64})/.exec(email.Text)![1];
  await fetch(`${testBaseUrl}/api/v1/invitations/${token}/accept`, {
    method: "POST",
    headers: { Cookie: inviteeCookie },
  });
}

let ownerCookie = "";
let adminCookie = "";
let admin2Cookie = "";
let memberCookie = "";
let companySlug = "";
let ownerUserId = "";
let admin2UserId = "";
let memberUserId = "";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();

  await registerAndActivateUser(OWNER_USER);
  await registerAndActivateUser(ADMIN_USER);
  await registerAndActivateUser(ADMIN2_USER);
  await registerAndActivateUser(MEMBER_USER);

  ownerCookie = await login(OWNER_USER.email, OWNER_USER.password);
  adminCookie = await login(ADMIN_USER.email, ADMIN_USER.password);
  admin2Cookie = await login(ADMIN2_USER.email, ADMIN2_USER.password);
  memberCookie = await login(MEMBER_USER.email, MEMBER_USER.password);

  const create = await fetch(`${testBaseUrl}/api/v1/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ name: "Granular Co" }),
  });
  companySlug = (await create.json()).slug;

  await inviteAndAccept(companySlug, ownerCookie, ADMIN_USER.email, "admin", adminCookie);
  await inviteAndAccept(companySlug, ownerCookie, ADMIN2_USER.email, "admin", admin2Cookie);
  await inviteAndAccept(companySlug, ownerCookie, MEMBER_USER.email, "member", memberCookie);

  const ids = await query<{ id: string; username: string }>({
    text: "SELECT id, username FROM users WHERE username = ANY($1::varchar[]);",
    values: [
      [OWNER_USER.username, ADMIN_USER.username, ADMIN2_USER.username, MEMBER_USER.username],
    ],
  });
  ownerUserId = ids.rows.find((r) => r.username === OWNER_USER.username)!.id;
  admin2UserId = ids.rows.find((r) => r.username === ADMIN2_USER.username)!.id;
  memberUserId = ids.rows.find((r) => r.username === MEMBER_USER.username)!.id;
});

describe("PATCH /members/[user_id] with { features }", () => {
  test("Owner edits a member's features", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${memberUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({
          features: ["read:company", "read:member", "read:invitation"],
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("member");
    expect(body.features.sort()).toEqual(["read:company", "read:member", "read:invitation"].sort());
  });

  test("Server closes dependency set (create:invitation pulls read:invitation)", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${memberUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({ features: ["create:invitation"] }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.features).toContain("create:invitation");
    expect(body.features).toContain("read:invitation");
  });

  test("delete:company is dropped — never assignable via granular UI", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${memberUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({
          features: ["read:company", "delete:company"],
        }),
      },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).features).not.toContain("delete:company");
  });

  test("Admin can edit a non-management member", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${memberUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          features: ["read:company", "read:member"],
        }),
      },
    );
    expect(res.status).toBe(200);
  });

  test("Admin cannot edit another admin", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${admin2UserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          features: ["read:company"],
        }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Admin cannot edit the owner", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${ownerUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          features: ["read:company"],
        }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Caller cannot edit themselves through this route", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/v1/companies/${companySlug}/members/${ownerUserId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: ownerCookie },
        body: JSON.stringify({
          features: ["read:company"],
        }),
      },
    );
    expect(res.status).toBe(403);
  });

  test("Audit log records member.features_changed", async () => {
    await fetch(`${testBaseUrl}/api/v1/companies/${companySlug}/members/${memberUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ features: ["read:company", "read:member", "read:audit_log"] }),
    });
    const log = await query<{ action: string; metadata: { new_features: string[] } }>({
      text: `SELECT action, metadata FROM audit_log
             WHERE action = 'member.features_changed'
             ORDER BY created_at DESC LIMIT 1;`,
    });
    expect(log.rows[0].action).toBe("member.features_changed");
    expect(log.rows[0].metadata.new_features).toContain("read:audit_log");
  });
});
