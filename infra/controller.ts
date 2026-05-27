// HTTP helpers for App Router route handlers:
// - `errorToResponse(error)`: maps known errors to NextResponse.json. Clears
//   the session cookie on AuthenticationError so a stale token doesn't keep
//   triggering 401s on every request.
// - Session cookie helpers (set/clear).
// - `loadCurrentUser()`: returns either the authenticated user (from the
//   session cookie) or an anonymous user shaped for `isAuthorized`.
// - `canRequest(feature, resource?)`: gates a route on a feature, throws
//   ForbiddenError otherwise. Returns the loaded user/session so the handler
//   can use them without a second lookup.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  ForbiddenError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  ServiceError,
  ValidationError,
} from "infra/errors";
import {
  AuthorizationScope,
  AuthorizedUser,
  PERMISSIONS,
  isAuthorized,
} from "models/authorization";
import { Session, getValidSessionByToken } from "models/session";
import { PublicUser, getUserById, serializePublicUser } from "models/user";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "sacola_session_id";
const SESSION_LIFETIME_SECONDS = 6 * 60 * 60; // 6 hours

// `user` is null when the request has no valid session cookie. Routes that
// allow anonymous traffic should still call `canRequest(feature)` — it builds
// an anonymous AuthorizedUser internally for the `isAuthorized` check.
export type LoadedContext = {
  user: PublicUser | null;
  session: Session | null;
};

const COMMON_ERRORS = [
  ValidationError,
  ServiceError,
  MethodNotAllowedError,
  NotFoundError,
  ForbiddenError,
] as const;

export function errorToResponse(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) {
    const response = NextResponse.json(error.toJSON(), { status: error.statusCode });
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  }

  for (const ErrorType of COMMON_ERRORS) {
    if (error instanceof ErrorType) {
      if (error.statusCode >= 500) {
        console.error(error);
      }
      return NextResponse.json(error.toJSON(), { status: error.statusCode });
    }
  }

  const fallback = new InternalServerError({ cause: error });
  console.error(fallback);
  return NextResponse.json(fallback.toJSON(), { status: fallback.statusCode });
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, token, {
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function loadCurrentUser(): Promise<LoadedContext> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return { user: null, session: null };
  }

  const session = await getValidSessionByToken(token);
  const dbUser = await getUserById(session.user_id);
  return { user: serializePublicUser(dbUser), session };
}

export async function canRequest(
  feature: string,
  scope: AuthorizationScope = {},
): Promise<LoadedContext> {
  const context = await loadCurrentUser();
  const authUser: AuthorizedUser = context.user ?? {
    id: null,
    features: PERMISSIONS.default.anonymousUser,
  };

  if (!(await isAuthorized(authUser, feature, scope))) {
    throw new ForbiddenError({
      cause: new Error(`Missing feature \`${feature}\``),
      message: "Você não possui permissão para executar esta ação.",
      action: `Verifique se o seu usuário possui a feature "${feature}".`,
    });
  }

  return context;
}
