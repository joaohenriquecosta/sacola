import { clearDatabase, runPendingMigrations, testBaseUrl, waitForAllServices } from "tests/orchestrator";

const expectedDbVersion = process.env.POSTGRES_VERSION;
const expectedMaxConnections = parseInt(process.env.POSTGRES_MAX_CONNECTIONS ?? "0");

beforeAll(async () => {
  await waitForAllServices();
  await clearDatabase();
  await runPendingMigrations();
});

async function getStatus() {
  const response = await fetch(`${testBaseUrl}/api/v1/status`);
  const responseBody = await response.json();
  return { response, responseBody };
}

describe("GET /api/v1/status", () => {
  describe("Anonymous user", () => {
    test("Returns status with database version and connection stats", async () => {
      const { response, responseBody } = await getStatus();

      expect(response.status).toBe(200);

      expect(responseBody.updated_at).toBeDefined();
      expect(responseBody.updated_at).toEqual(new Date(responseBody.updated_at).toISOString());

      expect(responseBody.dependencies.db.version).toEqual(expectedDbVersion);
      expect(responseBody.dependencies.db.max_connections).toEqual(expectedMaxConnections);
      expect(responseBody.dependencies.db.opened_connections).toBeGreaterThanOrEqual(1);
    });
  });
});
