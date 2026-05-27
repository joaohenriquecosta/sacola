// POST /api/v1/activations re-issues activation emails. Anti-enumeration:
// the response is always 202 regardless of whether the email exists or is
// already activated — the only observable difference is mailpit.

import {
  clearDatabase,
  deleteAllEmails,
  getLastEmail,
  registerAndActivateUser,
  runPendingMigrations,
  testBaseUrl,
  waitForAllServices,
} from "tests/orchestrator";

beforeAll(async () => {
  await waitForAllServices();
});

beforeEach(async () => {
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();
});

async function register(input: { username: string; email: string; password: string }) {
  return fetch(`${testBaseUrl}/api/v1/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

describe("POST /api/v1/activations (resend)", () => {
  test("unknown email → 202, no email sent (anti-enumeration)", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/activations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ghost@example.com" }),
    });
    expect(res.status).toBe(202);
    await expect(getLastEmail()).rejects.toThrow(/no emails/);
  });

  test("already-activated email → 202, no email sent (anti-enumeration)", async () => {
    await registerAndActivateUser({
      username: "alice",
      email: "alice@example.com",
      password: "ValidSenha!2026",
    });
    await deleteAllEmails();

    const res = await fetch(`${testBaseUrl}/api/v1/activations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com" }),
    });
    expect(res.status).toBe(202);
    await expect(getLastEmail()).rejects.toThrow(/no emails/);
  });

  test("unactivated email → 202 + new email + new token (old token invalidated)", async () => {
    await register({
      username: "bob",
      email: "bob@example.com",
      password: "ValidSenha!2026",
    });
    const firstEmail = await getLastEmail();
    const firstToken = /\/cadastro\/ativar\/([a-f0-9]{64})/.exec(firstEmail.Text)![1];
    await deleteAllEmails();

    const res = await fetch(`${testBaseUrl}/api/v1/activations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com" }),
    });
    expect(res.status).toBe(202);

    const secondEmail = await getLastEmail();
    const secondToken = /\/cadastro\/ativar\/([a-f0-9]{64})/.exec(secondEmail.Text)![1];
    expect(secondToken).not.toBe(firstToken);

    // The OLD token must no longer activate — forwarded older email is dead.
    const oldRes = await fetch(`${testBaseUrl}/api/v1/activations/${firstToken}`, {
      method: "PATCH",
    });
    expect(oldRes.status).toBe(400);

    // The NEW token works.
    const newRes = await fetch(`${testBaseUrl}/api/v1/activations/${secondToken}`, {
      method: "PATCH",
    });
    expect(newRes.status).toBe(200);
  });

  test("malformed body → 202 (silently noop, never surface enumeration signal)", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/activations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: 42 }),
    });
    expect(res.status).toBe(202);
  });
});
