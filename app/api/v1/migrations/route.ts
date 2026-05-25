import { NextResponse } from "next/server";

import { errorToResponse } from "infra/controller";
import { NotFoundError } from "infra/errors";
import { listPendingMigrations, runPendingMigrations } from "models/migrator";

// Both verbs are dev/test-only. In production and preview deploys, migrations
// run at build time (`npm run vercel-build`). Runtime listing also breaks
// because Next.js doesn't bundle `infra/migrations/*.js` into the serverless
// function, so `node-pg-migrate` can't find them. The test orchestrator still
// hits these locally to reset state after clearDatabase.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return errorToResponse(new NotFoundError());
  }
  try {
    const pending = await listPendingMigrations();
    return NextResponse.json(pending);
  } catch (err) {
    return errorToResponse(err);
  }
}

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
