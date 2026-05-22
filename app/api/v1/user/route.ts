import { NextResponse } from "next/server";

import { errorToResponse, loadCurrentUser, setSessionCookie } from "infra/controller";
import { AuthenticationError } from "infra/errors";
import { filterOutput } from "models/authorization";
import { refreshSession } from "models/session";

export async function GET() {
  try {
    const { user, session } = await loadCurrentUser();
    if (!session || !user) {
      throw new AuthenticationError({
        cause: new Error("GET /api/v1/user without an active session"),
        message: "Sessão inválida.",
        action: "Faça login para continuar.",
      });
    }

    await refreshSession(session.id);
    await setSessionCookie(session.token);

    return NextResponse.json(
      filterOutput(
        { id: user.id, features: user.features },
        "read:user:self",
        user as unknown as Record<string, unknown>,
      ),
      { status: 200 },
    );
  } catch (err) {
    return errorToResponse(err);
  }
}
