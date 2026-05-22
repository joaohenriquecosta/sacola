import { NextRequest, NextResponse } from "next/server";

import {
  canRequest,
  clearSessionCookie,
  errorToResponse,
  loadCurrentUser,
  setSessionCookie,
} from "infra/controller";
import { AuthenticationError } from "infra/errors";
import { filterOutput } from "models/authorization";
import { getUser } from "models/authentication";
import { createSession, expireSessionById } from "models/session";
import { serializePublicUser } from "models/user";

export async function POST(request: NextRequest) {
  try {
    await canRequest("create:session");
    const body = await request.json();
    const authenticatedUser = await getUser(body?.email, body?.password);
    const session = await createSession(authenticatedUser.id);
    await setSessionCookie(session.token);

    const publicUser = serializePublicUser(authenticatedUser);
    return NextResponse.json(
      filterOutput(
        { id: publicUser.id, features: publicUser.features },
        "read:user:self",
        publicUser as unknown as Record<string, unknown>,
      ),
      { status: 201 },
    );
  } catch (err) {
    return errorToResponse(err);
  }
}

export async function DELETE() {
  try {
    const { user, session } = await loadCurrentUser();
    if (!session || !user) {
      throw new AuthenticationError({
        cause: new Error("DELETE /api/v1/sessions without an active session"),
        message: "Sessão inválida.",
        action: "Faça login para continuar.",
      });
    }

    const expiredSession = await expireSessionById(session.id);
    await clearSessionCookie();

    return NextResponse.json(
      filterOutput(
        { id: user.id, features: user.features },
        "read:session",
        expiredSession as unknown as Record<string, unknown>,
      ),
      { status: 200 },
    );
  } catch (err) {
    return errorToResponse(err);
  }
}
