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

async function login(): Promise<string> {
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

describe("GET /api/v1/user", () => {
  describe("With a valid session", () => {
    test("Returns the current user via filterOutput(read:user:self)", async () => {
      const token = await login();

      const response = await fetch(`${testBaseUrl}/api/v1/user`, {
        headers: { Cookie: `sacola_session_id=${token}` },
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.username).toBe(VALID_USER.username);
      expect(body.email).toBe(VALID_USER.email);
      expect(body.features).toEqual(expect.arrayContaining(["create:session", "read:user:self"]));
      expect(body.password).toBeUndefined();
    });

    test("Re-sets the session cookie so its Max-Age tracks the refreshed session", async () => {
      const token = await login();

      const response = await fetch(`${testBaseUrl}/api/v1/user`, {
        headers: { Cookie: `sacola_session_id=${token}` },
      });

      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toMatch(/sacola_session_id=/);
      expect(setCookie).toMatch(/Max-Age=21600/i);
    });
  });

  describe("Without a session", () => {
    test("Returns 401 AuthenticationError when no cookie is sent", async () => {
      const response = await fetch(`${testBaseUrl}/api/v1/user`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.name).toBe("AuthenticationError");
    });

    test("Returns 401 with a clear-cookie header when the cookie is invalid", async () => {
      const response = await fetch(`${testBaseUrl}/api/v1/user`, {
        headers: { Cookie: "sacola_session_id=not-a-real-token" },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.name).toBe("AuthenticationError");

      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toMatch(/sacola_session_id=/);
      expect(setCookie).toMatch(/Max-Age=0/i);
    });
  });
});
