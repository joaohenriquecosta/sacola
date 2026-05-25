import {
  clearDatabase,
  deleteAllEmails,
  registerAndActivateUser,
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
  await deleteAllEmails();
  await registerAndActivateUser(VALID_USER);
});

async function postSession(body: unknown) {
  const response = await fetch(`${testBaseUrl}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json();
  return { response, responseBody };
}

describe("POST /api/v1/sessions", () => {
  describe("Anonymous user", () => {
    test("Logs in with correct credentials, sets cookie, returns serialized user", async () => {
      const { response, responseBody } = await postSession({
        email: VALID_USER.email,
        password: VALID_USER.password,
      });

      expect(response.status).toBe(201);
      expect(responseBody.username).toBe(VALID_USER.username);
      expect(responseBody.email).toBe(VALID_USER.email);
      expect(responseBody.password).toBeUndefined();

      const setCookie = response.headers.get("set-cookie");
      expect(setCookie).toMatch(/sacola_session_id=/);
      expect(setCookie).toMatch(/HttpOnly/i);
    });

    test("Returns 401 on wrong password (no email enumeration)", async () => {
      const { response, responseBody } = await postSession({
        email: VALID_USER.email,
        password: "WrongSenha!2026",
      });

      expect(response.status).toBe(401);
      expect(responseBody.name).toBe("AuthenticationError");
      expect(responseBody.message).toBe("Email ou senha inválidos.");
    });

    test("Returns 401 on missing user with the same shape as wrong password", async () => {
      const { response, responseBody } = await postSession({
        email: "ghost@example.com",
        password: "AnythingValid!2026",
      });

      expect(response.status).toBe(401);
      expect(responseBody.name).toBe("AuthenticationError");
      expect(responseBody.message).toBe("Email ou senha inválidos.");
    });

    test("Returns 400 on missing email or password", async () => {
      const { response, responseBody } = await postSession({ email: "", password: "" });
      expect(response.status).toBe(400);
      expect(responseBody.name).toBe("ValidationError");
    });
  });
});
