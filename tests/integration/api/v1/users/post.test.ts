import {
  clearDatabase,
  runPendingMigrations,
  testBaseUrl,
  waitForAllServices,
} from "tests/orchestrator";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
});

async function postUser(body: unknown) {
  const response = await fetch(`${testBaseUrl}/api/v1/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseBody = await response.json();
  return { response, responseBody };
}

describe("POST /api/v1/users", () => {
  describe("Anonymous user", () => {
    test("Creates a user and returns 201 with serialized PublicUser", async () => {
      const { response, responseBody } = await postUser({
        username: "alice",
        email: "alice@example.com",
        password: "ValidSenha!2026",
      });

      expect(response.status).toBe(201);
      expect(responseBody.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(responseBody.username).toBe("alice");
      expect(responseBody.email).toBe("alice@example.com");
      expect(responseBody.features).toEqual(
        expect.arrayContaining(["create:session", "read:user:self"]),
      );
      expect(responseBody.password).toBeUndefined();
      expect(Date.parse(responseBody.created_at)).not.toBeNaN();
    });

    test("Rejects duplicate username (case-insensitive) with 400", async () => {
      const { response, responseBody } = await postUser({
        username: "ALICE",
        email: "alice2@example.com",
        password: "ValidSenha!2026",
      });

      expect(response.status).toBe(400);
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toMatch(/username/i);
    });

    test("Rejects duplicate email (case-insensitive) with 400", async () => {
      const { response, responseBody } = await postUser({
        username: "alice2",
        email: "ALICE@example.com",
        password: "ValidSenha!2026",
      });

      expect(response.status).toBe(400);
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toMatch(/email/i);
    });

    test("Rejects password shorter than 12 chars", async () => {
      const { response, responseBody } = await postUser({
        username: "bob",
        email: "bob@example.com",
        password: "Curta!1",
      });

      expect(response.status).toBe(400);
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toMatch(/senha/i);
    });

    test("Rejects password without a special character", async () => {
      const { response, responseBody } = await postUser({
        username: "bob",
        email: "bob@example.com",
        password: "abcdef1234567890",
      });

      expect(response.status).toBe(400);
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toMatch(/senha/i);
    });

    test("Rejects malformed email", async () => {
      const { response, responseBody } = await postUser({
        username: "bob",
        email: "not-an-email",
        password: "ValidSenha!2026",
      });

      expect(response.status).toBe(400);
      expect(responseBody.name).toBe("ValidationError");
      expect(responseBody.message).toMatch(/email/i);
    });
  });
});
