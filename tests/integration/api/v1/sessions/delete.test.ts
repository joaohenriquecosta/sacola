import {
  clearDatabase,
  runPendingMigrations,
  testBaseUrl,
  waitForAllServices,
} from "tests/orchestrator";

const VALID_USER = {
  username: "alice",
  email: "alice@example.com",
  password: "ValidSenha!2026",
};

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
  await fetch(`${testBaseUrl}/api/v1/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_USER),
  });
});

async function login() {
  const response = await fetch(`${testBaseUrl}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: VALID_USER.email, password: VALID_USER.password }),
  });
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = /sacola_session_id=([^;]+)/.exec(setCookie);
  if (!match) {
    throw new Error(`No session cookie in response: ${setCookie}`);
  }
  return match[1];
}

describe("DELETE /api/v1/sessions", () => {
  describe("With a valid session", () => {
    test("Expires the session, clears the cookie, returns the expired session", async () => {
      const token = await login();

      const response = await fetch(`${testBaseUrl}/api/v1/sessions`, {
        method: "DELETE",
        headers: { Cookie: `sacola_session_id=${token}` },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.token).toBeDefined();
      expect(new Date(body.expires_at).getTime()).toBeLessThan(Date.now());

      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toMatch(/sacola_session_id=/);
      expect(setCookie).toMatch(/Max-Age=0/i);

      const followup = await fetch(`${testBaseUrl}/api/v1/sessions`, {
        method: "DELETE",
        headers: { Cookie: `sacola_session_id=${token}` },
      });
      expect(followup.status).toBe(401);
    });
  });

  describe("Without a session", () => {
    test("Returns 401 AuthenticationError when no cookie is sent", async () => {
      const response = await fetch(`${testBaseUrl}/api/v1/sessions`, {
        method: "DELETE",
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.name).toBe("AuthenticationError");
    });
  });
});
