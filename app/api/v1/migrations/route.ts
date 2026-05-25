import { NextResponse } from "next/server";

import { errorToResponse } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { listPendingMigrations, runPendingMigrations } from "models/migrator";

export async function GET() {
  try {
    const pending = await listPendingMigrations();
    return NextResponse.json(pending);
  } catch (err) {
    return errorToResponse(err);
  }
}

// POST only works outside production. In production and preview deploys,
// migrations run at build time (`npm run vercel-build`) — exposing this
// endpoint there would let anyone re-run or list pending migrations.
// The test orchestrator still hits it locally to reset state after
// clearDatabase, which is why it isnt removed entirely.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return errorToResponse(new NotFoundError());
  }
  try {
    const migrated = await runPendingMigrations();
    const status = migrated.length > 0 ? 201 : 200;
    return NextResponse.json(migrated, { status });
  } catch (err) {
    return errorToResponse(err);
  }
}
