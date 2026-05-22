import { clearDatabase, testBaseUrl, waitForAllServices } from "tests/orchestrator";

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  // Intentionally NOT pre-running migrations — this file tests the endpoint applying them.
});

describe("POST /api/v1/migrations", () => {
  describe("Anonymous user", () => {
    test("Applies pending migrations and returns 201, or 200 when none exist", async () => {
      const response = await fetch(`${testBaseUrl}/api/v1/migrations`, { method: "POST" });

      expect([200, 201]).toContain(response.status);

      const responseBody = await response.json();
      expect(Array.isArray(responseBody)).toBe(true);
    });

    test("Returns 200 with empty list when called again with no pending migrations", async () => {
      const response = await fetch(`${testBaseUrl}/api/v1/migrations`, { method: "POST" });

      expect(response.status).toBe(200);

      const responseBody = await response.json();
      expect(responseBody).toEqual([]);
    });
  });
});
