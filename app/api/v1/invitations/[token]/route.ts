// Public-facing details for /convite/[token]. Returns only what the landing
// page needs to render — no token echoed back, no other invitations in the
// payload, nothing that would let a third party fish for org structure.

import { NextResponse } from "next/server";

import { errorToResponse } from "infra/controller";
import { getPublicInvitationView } from "models/invitation";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const view = await getPublicInvitationView(token);
    return NextResponse.json(view);
  } catch (err) {
    return errorToResponse(err);
  }
}
