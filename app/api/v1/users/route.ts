import { NextRequest, NextResponse } from "next/server";

import { canRequest, errorToResponse } from "infra/controller";
import { registerUser } from "models/activation";
import { serializePublicUser } from "models/user";

export async function POST(request: NextRequest) {
  try {
    await canRequest("create:user");
    const body = await request.json();
    const newUser = await registerUser({
      username: body?.username,
      email: body?.email,
      password: body?.password,
    });
    return NextResponse.json(serializePublicUser(newUser), { status: 201 });
  } catch (err) {
    return errorToResponse(err);
  }
}
