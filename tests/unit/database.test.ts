// Unit tests for infra/database.ts.
//
// We mock the `pg` module instead of hitting a real Postgres so the suite stays
// fast and dependency-free. Real database behavior is exercised end-to-end by
// the integration tests against the API endpoints (those land in a later issue,
// together with the tests orchestrator + advisory lock).

const mockClientInstance = {
  connect: jest.fn(),
  query: jest.fn(),
  end: jest.fn(),
};

jest.mock("pg", () => ({
  Client: jest.fn(() => mockClientInstance),
}));

import { Client } from "pg";
import { query, getNewClient } from "infra/database";
import { ServiceError } from "infra/errors";

const MockedClient = Client as unknown as jest.Mock;

const ORIGINAL_ENV = { ...process.env };

// NODE_ENV is typed as a readonly string in Next's type augmentation, so we
// override it through Object.defineProperty for the SSL-toggle tests.
function setNodeEnv(value: string): void {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
  mockClientInstance.connect.mockResolvedValue(undefined);
  mockClientInstance.query.mockResolvedValue({ rows: [] });
  mockClientInstance.end.mockResolvedValue(undefined);
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("getNewClient", () => {
  test("connects and pins the session timezone to UTC", async () => {
    const client = await getNewClient();
    expect(mockClientInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockClientInstance.query).toHaveBeenCalledWith("SET timezone = 'UTC'");
    expect(client).toBe(mockClientInstance);
  });

  test("uses DATABASE_URL via connectionString when set (Neon/Vercel path)", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@host.neon.tech/db?sslmode=require";
    setNodeEnv("production");
    await getNewClient();
    expect(MockedClient).toHaveBeenCalledWith({
      connectionString: "postgresql://u:p@host.neon.tech/db?sslmode=require",
      ssl: true,
    });
  });

  test("forces SSL on the DATABASE_URL path in production (Neon refuses cleartext)", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@host.neon.tech/db";
    setNodeEnv("production");
    await getNewClient();
    expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ ssl: true }));
  });

  test("disables SSL on the DATABASE_URL path outside production (local Docker)", async () => {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost/sacola_dev";
    setNodeEnv("development");
    await getNewClient();
    expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ ssl: false }));
  });

  test("falls back to individual POSTGRES_* vars when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    setNodeEnv("production");
    await getNewClient();
    expect(MockedClient).toHaveBeenCalledWith(
      expect.objectContaining({
        host: process.env.POSTGRES_HOST,
        user: process.env.POSTGRES_USER,
        database: process.env.POSTGRES_DB,
      }),
    );
  });

  test("enables SSL when NODE_ENV is production and falling back to POSTGRES_* vars", async () => {
    delete process.env.DATABASE_URL;
    setNodeEnv("production");
    await getNewClient();
    expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ ssl: true }));
  });

  test("disables SSL outside production when falling back to POSTGRES_* vars", async () => {
    delete process.env.DATABASE_URL;
    setNodeEnv("development");
    await getNewClient();
    expect(MockedClient).toHaveBeenCalledWith(expect.objectContaining({ ssl: false }));
  });
});

describe("query", () => {
  test("forwards a string query verbatim to the client", async () => {
    mockClientInstance.query
      .mockResolvedValueOnce({ rows: [] }) // SET timezone
      .mockResolvedValueOnce({ rows: [{ ok: true }] });

    const result = await query("SELECT 1");

    expect(mockClientInstance.query).toHaveBeenLastCalledWith("SELECT 1");
    expect(result.rows).toEqual([{ ok: true }]);
  });

  test("forwards { text, values } as positional arguments", async () => {
    mockClientInstance.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await query({ text: "SELECT $1::int", values: [42] });

    expect(mockClientInstance.query).toHaveBeenLastCalledWith("SELECT $1::int", [42]);
  });

  test("closes the client after a successful query", async () => {
    await query("SELECT 1");
    expect(mockClientInstance.end).toHaveBeenCalledTimes(1);
  });

  test("closes the client even when the query fails", async () => {
    mockClientInstance.query
      .mockResolvedValueOnce({ rows: [] }) // SET timezone
      .mockRejectedValueOnce(new Error("syntax error"));

    await expect(query("BAD SQL")).rejects.toBeInstanceOf(ServiceError);
    expect(mockClientInstance.end).toHaveBeenCalledTimes(1);
  });

  test("wraps a connect failure in ServiceError without leaking the cause to JSON", async () => {
    mockClientInstance.connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    let captured: unknown;
    await query("SELECT 1").catch((err) => {
      captured = err;
    });

    expect(captured).toBeInstanceOf(ServiceError);
    expect((captured as ServiceError).message).toBe("Erro na conexão com o Banco de Dados.");
    // The client was never returned, so .end() must not have been called.
    expect(mockClientInstance.end).not.toHaveBeenCalled();
  });

  test("wraps a query failure in ServiceError", async () => {
    mockClientInstance.query
      .mockResolvedValueOnce({ rows: [] }) // SET timezone
      .mockRejectedValueOnce(new Error("permission denied"));

    let captured: unknown;
    await query("SELECT 1").catch((err) => {
      captured = err;
    });

    expect(captured).toBeInstanceOf(ServiceError);
    expect((captured as ServiceError).message).toBe("Erro na Query ao Banco de Dados.");
  });
});
