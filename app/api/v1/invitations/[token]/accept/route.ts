// Accept an invite. Two paths depending on session state:
//
// 1. logged in → require the session's email to match the invite, then
//    just attach a membership.
// 2. anonymous → body must include { username, password }; we create the
//    user (pre-activated — the invite link proved email ownership) and
//    attach the membership, then log them in.
//
// In both cases the response sets a session cookie and returns the company
// slug so the UI knows where to redirect.

import { NextRequest, NextResponse } from "next/server";

import { errorToResponse, loadCurrentUser, setSessionCookie } from "infra/controller";
import { ValidationError } from "infra/errors";
import { logSafe } from "models/audit-log";
import { acceptInvitationWithExistingUser, registerAndAcceptInvitation } from "models/invitation";
import { createSession } from "models/session";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = await request.json().catch(() => ({}));

    const { user } = await loadCurrentUser();
    let userId: string;
    let companyId: string;
    let companySlug: string;
    let role: string;
    let via: "existing_user" | "register_and_accept";

    if (user) {
      const result = await acceptInvitationWithExistingUser(token, {
        id: user.id,
        email: user.email,
      });
      userId = user.id;
      companyId = result.company.id;
      companySlug = result.company.slug;
      role = result.invitation.role;
      via = "existing_user";
    } else {
      if (typeof body?.username !== "string" || typeof body?.password !== "string") {
        throw new ValidationError({
          message: "Username e senha são obrigatórios para aceitar este convite.",
          action: "Forneça username e senha, ou faça login com a conta convidada.",
        });
      }
      const result = await registerAndAcceptInvitation(token, {
        username: body.username,
        password: body.password,
      });
      userId = result.user.id;
      companyId = result.company.id;
      companySlug = result.company.slug;
      role = result.invitation.role;
      via = "register_and_accept";
    }

    const session = await createSession(userId);
    await setSessionCookie(session.token);

    await logSafe({
      companyId,
      actorId: userId,
      action: "member.joined",
      targetType: "membership",
      // No membership id surfaced from the accept helpers; targetId stays
      // null and the actor + metadata are enough to trace.
      metadata: { role, via },
    });

    return NextResponse.json({ slug: companySlug }, { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
