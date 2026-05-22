import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse, setSessionCookie } from "infra/controller";
import { filterOutput } from "models/authorization";
import { getUser } from "models/authentication";
import { createSession } from "models/session";
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
