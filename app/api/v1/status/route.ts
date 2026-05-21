import { NextResponse } from "next/server";

import { errorToResponse } from "infra/controller";
import { getSystemStatus } from "models/status";

export async function GET() {
  try {
    const status = await getSystemStatus();
    return NextResponse.json(status);
  } catch (err) {
    return errorToResponse(err);
  }
}
