import { NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { activateUserByToken } from "models/activation";
import { filterOutput } from "models/authorization";

type RouteContext = { params: Promise<{ token: string }> };

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const { user } = await canRequest("read:activation_token");
    const { token } = await context.params;
    const used = await activateUserByToken(token);

    const requester = user ?? { id: null, features: [] };
    const filtered = filterOutput(
      requester,
      "read:activation_token",
      used as unknown as Record<string, unknown>,
    );
    return NextResponse.json(filtered);
  } catch (err) {
    return errorToResponse(err);
  }
}
