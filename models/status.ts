// Aggregates a snapshot of the system's health: current timestamp + Postgres
// version + active vs max connections. Consumed by GET /api/v1/status.
//
// Mirrors automanews/models/status.js: three SHOW/SELECT queries against the
// configured database, with a single ServiceError if any of them fail to
// return a usable value.

import { query } from "infra/database";
import { ServiceError } from "infra/errors";

export type SystemStatus = {
  updated_at: string;
  dependencies: {
    db: {
      version: string;
      max_connections: number;
      opened_connections: number;
    };
  };
};

export async function getSystemStatus(): Promise<SystemStatus> {
  const updatedAt = new Date().toISOString();
  const dbVersion = await getDbVersion();
  const maxConnections = await getDbMaxConnections();
  const openedConnections = await getDbOpenedConnections();

  if (
    !dbVersion ||
    maxConnections == null ||
    Number.isNaN(maxConnections) ||
    openedConnections == null ||
    Number.isNaN(openedConnections)
  ) {
    throw new ServiceError({
      cause: new Error("Failed to get database status."),
      message: "Não foi possível obter o status do banco de dados.",
      action: "Verifique se o banco de dados está online e se as credenciais estão corretas.",
    });
  }

  return {
    updated_at: updatedAt,
    dependencies: {
      db: {
        version: dbVersion,
        max_connections: maxConnections,
        opened_connections: openedConnections,
      },
    },
  };
}

async function getDbVersion(): Promise<string | undefined> {
  const result = await query<{ server_version: string }>("SHOW server_version;");
  return result.rows[0]?.server_version;
}

async function getDbMaxConnections(): Promise<number> {
  const result = await query<{ max_connections: string }>("SHOW max_connections;");
  return parseInt(result.rows[0]?.max_connections ?? "", 10);
}

async function getDbOpenedConnections(): Promise<number> {
  const result = await query<{ opened_connections: string }>({
    text: `
      SELECT COUNT(*)::text AS opened_connections
      FROM pg_stat_activity
      WHERE datname = $1
    `,
    values: [process.env.POSTGRES_DB],
  });
  return parseInt(result.rows[0]?.opened_connections ?? "", 10);
}
