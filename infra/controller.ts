// Minimal HTTP helpers for App Router route handlers:
// - `errorToResponse(error)`: maps known errors to NextResponse.json with the
//   right status, falls back to InternalServerError for anything else.
// - Session cookie helpers (set/clear) used by the auth flow.
//
// `loadCurrentUser` and `canRequest(feature)` will be added together with the
// session and authorization models, in a later issue.

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

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "sacola_session_id";
const SESSION_LIFETIME_SECONDS = 6 * 60 * 60; // 6 hours

const COMMON_ERRORS = [
  ValidationError,
  ServiceError,
  MethodNotAllowedError,
  NotFoundError,
  ForbiddenError,
] as const;

export function errorToResponse(error: unknown): NextResponse {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(error.toJSON(), { status: error.statusCode });
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
