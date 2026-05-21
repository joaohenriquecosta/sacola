// Unit tests for models/status.ts.
//
// `query` from infra/database is mocked so we don't touch a real Postgres.
// End-to-end coverage of the GET /api/v1/status endpoint against a real
// database lands later, together with the tests orchestrator.

jest.mock("infra/database", () => ({
  query: jest.fn(),
}));

import { query } from "infra/database";
import { getSystemStatus } from "models/status";
import { ServiceError } from "infra/errors";

const mockedQuery = query as jest.MockedFunction<typeof query>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getSystemStatus", () => {
  test("returns timestamp + db version + connection counters", async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ server_version: "16.6" }] } as never)
      .mockResolvedValueOnce({ rows: [{ max_connections: "100" }] } as never)
      .mockResolvedValueOnce({ rows: [{ opened_connections: "3" }] } as never);

    const status = await getSystemStatus();

    expect(status.dependencies.db.version).toBe("16.6");
    expect(status.dependencies.db.max_connections).toBe(100);
    expect(status.dependencies.db.opened_connections).toBe(3);
    expect(Date.parse(status.updated_at)).not.toBeNaN();
  });

  test("opened_connections query filters by current database name", async () => {
    process.env.POSTGRES_DB = "sacola_test";
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ server_version: "16.6" }] } as never)
      .mockResolvedValueOnce({ rows: [{ max_connections: "100" }] } as never)
      .mockResolvedValueOnce({ rows: [{ opened_connections: "1" }] } as never);

    await getSystemStatus();

    expect(mockedQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("pg_stat_activity"),
        values: ["sacola_test"],
      }),
    );
  });

  test("throws ServiceError when version is missing", async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ max_connections: "100" }] } as never)
      .mockResolvedValueOnce({ rows: [{ opened_connections: "1" }] } as never);

    await expect(getSystemStatus()).rejects.toMatchObject({
      name: "ServiceError",
      message: "Não foi possível obter o status do banco de dados.",
    });
  });

  test("throws ServiceError when max_connections is not numeric", async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ server_version: "16.6" }] } as never)
      .mockResolvedValueOnce({ rows: [{ max_connections: "not-a-number" }] } as never)
      .mockResolvedValueOnce({ rows: [{ opened_connections: "1" }] } as never);

    await expect(getSystemStatus()).rejects.toBeInstanceOf(ServiceError);
  });

  test("propagates database errors from the underlying query()", async () => {
    const dbError = new Error("connection lost");
    mockedQuery.mockRejectedValueOnce(dbError);

    await expect(getSystemStatus()).rejects.toBe(dbError);
  });
});
