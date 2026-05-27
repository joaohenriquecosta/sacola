// Re-issue an activation email. The user fell out of the 15-minute window
// after registering (or never clicked the link) and wants a new one.
//
// Always returns 202 with no payload — there's no signal in the response
// about whether the email exists or is already activated. Internally the
// model only does work for unactivated accounts; everything else is a noop.

import { NextRequest, NextResponse } from "next/server";

import { errorToResponse } from "infra/controller";
import { resendActivationEmail } from "models/activation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    await resendActivationEmail(body?.email);
    return new NextResponse(null, { status: 202 });
  } catch (err) {
    // We deliberately swallow the success/fail signal in the response shape
    // above, but a real ServiceError (mailer down, DB unreachable) still
    // should surface so the client can show "tente novamente".
    return errorToResponse(err);
  }
}
