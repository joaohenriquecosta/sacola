import { clearDatabase, runPendingMigrations, testBaseUrl, waitForAllServices } from "tests/orchestrator";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
});

describe("GET /api/v1/migrations", () => {
  describe("Anonymous user", () => {
    test("Returns empty list when there are no pending migrations", async () => {
      const response = await fetch(`${testBaseUrl}/api/v1/migrations`);

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(Array.isArray(responseBody)).toBe(true);
      expect(responseBody.length).toBe(0);
    });
  });
});
