// Unit tests for models/migrator.ts.
//
// node-pg-migrate and infra/database.getNewClient are both mocked so we
// don't touch a real Postgres. The "really runs migrations" assertion lives
// with the integration tests for /api/v1/migrations (issue #4 onwards).

jest.mock("node-pg-migrate", () => ({
  runner: jest.fn(),
}));

jest.mock("infra/database", () => ({
  getNewClient: jest.fn(),
}));

import { runner } from "node-pg-migrate";
import { getNewClient } from "infra/database";
import { listPendingMigrations, runPendingMigrations } from "models/migrator";
import { ServiceError } from "infra/errors";

const mockRunner = runner as jest.MockedFunction<typeof runner>;
const mockGetNewClient = getNewClient as jest.MockedFunction<typeof getNewClient>;
const mockEnd = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNewClient.mockResolvedValue({ end: mockEnd } as never);
});

describe("listPendingMigrations", () => {
  test("invokes node-pg-migrate with dryRun: true and returns the list", async () => {
    const pending = [{ path: "/a", name: "001_init", timestamp: 1 }];
    mockRunner.mockResolvedValueOnce(pending as never);

    const result = await listPendingMigrations();

    expect(result).toEqual(pending);
    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, direction: "up" }),
    );
  });

  test("wraps failures in ServiceError and closes the client", async () => {
    mockRunner.mockRejectedValueOnce(new Error("boom"));

    await expect(listPendingMigrations()).rejects.toMatchObject({
      name: "ServiceError",
      message: "Erro ao listar as migrações pendentes.",
    });
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  test("does not call end() when getNewClient itself fails", async () => {
    mockGetNewClient.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(listPendingMigrations()).rejects.toBeInstanceOf(ServiceError);
    expect(mockEnd).not.toHaveBeenCalled();
  });
});

describe("runPendingMigrations", () => {
  test("invokes node-pg-migrate with dryRun: false", async () => {
    mockRunner.mockResolvedValueOnce([] as never);

    await runPendingMigrations();

    expect(mockRunner).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: false, direction: "up" }),
    );
  });

  test("returns the list of migrations that ran", async () => {
    const applied = [{ path: "/a", name: "001_init", timestamp: 1 }];
    mockRunner.mockResolvedValueOnce(applied as never);

    const result = await runPendingMigrations();
    expect(result).toEqual(applied);
  });

  test("wraps failures in ServiceError with the right message", async () => {
    mockRunner.mockRejectedValueOnce(new Error("boom"));

    await expect(runPendingMigrations()).rejects.toMatchObject({
      name: "ServiceError",
      message: "Erro ao executar as migrações pendentes.",
    });
  });
});
