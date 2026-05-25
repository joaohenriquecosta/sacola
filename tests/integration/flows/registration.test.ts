// End-to-end registration flow: POST /users creates an unactivated user,
// sends the activation email via mailpit, and login is blocked until the
// user clicks the link (PATCH /activations/[token]).

import { PERMISSIONS } from "models/authorization";
import {
  clearDatabase,
  deleteAllEmails,
  getActivationTokenForUserEmail,
  getLastEmail,
  runPendingMigrations,
  testBaseUrl,
  waitForAllServices,
} from "tests/orchestrator";

const USER = {
  username: "registrant",
  email: "registrant@example.com",
  password: "ValidSenha!2026",
};

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await deleteAllEmails();
});

describe("Registration → activation → login", () => {
  test("POST /api/v1/users creates an unactivated user and sends the activation email", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(USER),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.username).toBe(USER.username);
    expect(body.features).toEqual([...PERMISSIONS.default.unactivatedUser]);

    const email = await getLastEmail();
    expect(email.To[0].Address).toBe(USER.email);
    expect(email.Subject).toMatch(/ativ/i);
    expect(email.Text).toContain(USER.username);
    expect(email.Text).toMatch(/\/cadastro\/ativar\/[a-f0-9]{64}/);
  });

  test("Login is blocked until activation (401 with specific message)", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USER.email, password: USER.password }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/não foi ativada/i);
    expect(body.action).toMatch(/email/i);
  });

  test("After PATCH /activations/[token], login succeeds", async () => {
    const token = await getActivationTokenForUserEmail(USER.email);
    const activate = await fetch(`${testBaseUrl}/api/v1/activations/${token}`, {
      method: "PATCH",
    });
    expect(activate.status).toBe(200);

    const login = await fetch(`${testBaseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: USER.email, password: USER.password }),
    });
    expect(login.status).toBe(201);
  });
});
