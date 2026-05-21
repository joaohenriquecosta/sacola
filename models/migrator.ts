// Wraps node-pg-migrate so callers (CLI scripts, /api/v1/migrations endpoint)
// can list and run pending migrations without touching the migration runner
// API directly.
//
// Mirrors automanews/models/migrator.js: a dedicated pg client is opened for
// each call, the runner is fed the same migrationsTable name and migrations
// directory, and any failure is rewrapped in ServiceError so it doesn't leak
// driver-specific error shapes to clients.

import { runner, RunnerOption } from "node-pg-migrate";
import { resolve } from "node:path";
import type { Client } from "pg";

import { getNewClient } from "infra/database";
import { ServiceError } from "infra/errors";

function defaultMigrationsOptions(
  dbClient: Client,
  overrides: Partial<RunnerOption> = {},
): RunnerOption {
  return {
    dryRun: true,
    verbose: true,
    direction: "up",
    dbClient,
    log: () => {},
    migrationsTable: "pgmigrations",
    dir: resolve("infra", "migrations"),
    ...overrides,
  };
}

export async function listPendingMigrations() {
  let dbClient: Client | undefined;
  try {
    dbClient = await getNewClient();
    return await runner(defaultMigrationsOptions(dbClient));
  } catch (error) {
    const publicError = new ServiceError({
      cause: error,
      message: "Erro ao listar as migrações pendentes.",
    });
    console.error(publicError);
    throw publicError;
  } finally {
    await dbClient?.end();
  }
}

export async function runPendingMigrations() {
  let dbClient: Client | undefined;
  try {
    dbClient = await getNewClient();
    return await runner(defaultMigrationsOptions(dbClient, { dryRun: false }));
  } catch (error) {
    const publicError = new ServiceError({
      cause: error,
      message: "Erro ao executar as migrações pendentes.",
    });
    console.error(publicError);
    throw publicError;
  } finally {
    await dbClient?.end();
  }
}
