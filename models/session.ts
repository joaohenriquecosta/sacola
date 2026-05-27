// CRUD for the `sessions` table. Tokens are 96 hex chars (48 random bytes).
// Lifetime is 6 hours — matches SESSION_COOKIE_NAME's max-age in
// infra/controller.ts.

import { randomBytes } from "node:crypto";

import { query } from "infra/database";
import { AuthenticationError, ForbiddenError } from "infra/errors";
import { isAuthorized } from "models/authorization";
import { getUserById } from "models/user";

export const SESSION_LIFETIME_MS = 6 * 60 * 60 * 1000;

export type Session = {
  id: string;
  token: string;
  user_id: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

export async function createSession(userId: string): Promise<Session> {
  const user = await getUserById(userId);
  if (!(await isAuthorized(user, "create:session"))) {
    // Unactivated users have features = ["read:activation_token"] only. Tell
    // them where to look — but only the login route reaches this point with a
    // verified password, so revealing activation status is gated on knowing
    // the credentials (acceptable enumeration trade-off).
    const isUnactivated = user.features.includes("read:activation_token");
    throw isUnactivated
      ? new AuthenticationError({
          cause: new Error(`User ${user.id} is not activated`),
          message: "Sua conta ainda não foi ativada.",
          action: "Verifique seu email pelo link de ativação enviado no cadastro.",
        })
      : new ForbiddenError({
          cause: new Error(`User ${user.id} cannot create sessions`),
          message: "Você não possui permissão para criar sessões.",
          action: "Entre em contato com o administrador da conta.",
        });
  }

  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  return await insertSessionQuery({ token, userId: user.id, expiresAt });
}

export async function getValidSessionByToken(token: string): Promise<Session> {
  const session = await findValidSessionByTokenQuery(token);
  if (!session) {
    throw new AuthenticationError({
      cause: new Error("Session not found or expired"),
      message: "Sessão inválida.",
      action: "Faça login novamente para continuar.",
    });
  }
  return session;
}

export async function refreshSession(sessionId: string): Promise<Session | null> {
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const result = await query<Session>({
    text: `
      UPDATE
        sessions
      SET
        expires_at = $2,
        updated_at = timezone('utc', now())
      WHERE
        id = $1
      RETURNING
        *
    ;`,
    values: [sessionId, expiresAt],
  });
  return result.rows[0] ?? null;
}

export async function expireSessionById(sessionId: string): Promise<Session | null> {
  const result = await query<Session>({
    text: `
      UPDATE
        sessions
      SET
        expires_at = timezone('utc', now()) - INTERVAL '1 year',
        updated_at = timezone('utc', now())
      WHERE
        id = $1
      RETURNING
        *
    ;`,
    values: [sessionId],
  });
  return result.rows[0] ?? null;
}

async function insertSessionQuery(input: {
  token: string;
  userId: string;
  expiresAt: Date;
}): Promise<Session> {
  const result = await query<Session>({
    text: `
      INSERT INTO
        sessions (token, user_id, expires_at)
      VALUES
        ($1, $2, $3)
      RETURNING
        *
    ;`,
    values: [input.token, input.userId, input.expiresAt],
  });
  return result.rows[0];
}

async function findValidSessionByTokenQuery(token: string): Promise<Session | null> {
  const result = await query<Session>({
    text: `
      SELECT
        *
      FROM
        sessions
      WHERE
        token = $1
        AND expires_at > timezone('utc', now())
      LIMIT
        1
    ;`,
    values: [token],
  });
  return result.rows[0] ?? null;
}
