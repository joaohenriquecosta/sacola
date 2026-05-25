import { PERMISSIONS } from "models/authorization";
import {
  clearDatabase,
  deleteAllEmails,
  getActivationTokenForUserEmail,
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
  const res = await fetch(`${testBaseUrl}/api/v1/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return await res.json();
}

describe("PATCH /api/v1/activations/[token]", () => {
  test("Activates the user and upgrades features to default.activatedUser", async () => {
    const created = await register({
      username: "alice",
      email: "alice@example.com",
      password: "ValidSenha!2026",
    });
    expect(created.features).toEqual([...PERMISSIONS.default.unactivatedUser]);

    const token = await getActivationTokenForUserEmail("alice@example.com");
    const activateRes = await fetch(`${testBaseUrl}/api/v1/activations/${token}`, {
      method: "PATCH",
    });
    expect(activateRes.status).toBe(200);

    const body = await activateRes.json();
    expect(body.used_at).not.toBeNull();
    expect(new Date(body.used_at).getTime()).toBeLessThanOrEqual(Date.now());

    // Login should now work — proves features were upgraded.
    const loginRes = await fetch(`${testBaseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.com", password: "ValidSenha!2026" }),
    });
    expect(loginRes.status).toBe(201);
  });

  test("Returns 400 for an unknown token", async () => {
    const res = await fetch(`${testBaseUrl}/api/v1/activations/${"f".repeat(64)}`, {
      method: "PATCH",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.name).toBe("ValidationError");
    expect(body.message).toMatch(/inválido|expirado/i);
  });

  test("Returns 400 for a token that was already used", async () => {
    await register({
      username: "bob",
      email: "bob@example.com",
      password: "ValidSenha!2026",
    });
    const token = await getActivationTokenForUserEmail("bob@example.com");

    const first = await fetch(`${testBaseUrl}/api/v1/activations/${token}`, { method: "PATCH" });
    expect(first.status).toBe(200);

    const second = await fetch(`${testBaseUrl}/api/v1/activations/${token}`, { method: "PATCH" });
    expect(second.status).toBe(400);
  });
});
