import { NextResponse } from "next/server";

import { errorToResponse } from "infra/controller";
import { listPendingMigrations, runPendingMigrations } from "models/migrator";

export async function GET() {
  try {
    const pending = await listPendingMigrations();
    return NextResponse.json(pending);
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function POST() {
  try {
    const migrated = await runPendingMigrations();
    const status = migrated.length > 0 ? 201 : 200;
    return NextResponse.json(migrated, { status });
  } catch (err) {
    return errorToResponse(err);
  }
}
