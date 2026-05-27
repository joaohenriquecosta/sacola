// Email-based activation tokens.
//
// A user is created as `unactivatedUser` (no session permissions). We mail
// them a 64-hex token; clicking the link calls PATCH /api/v1/activations/[token]
// which marks the token as used and upgrades the user's features to
// `activatedUser`. Tokens expire 15 minutes after creation.
//
// Mirrors automanews/models/activation.js with TS types and the Sacola
// permission catalog.

import { randomBytes } from "node:crypto";

import { query } from "infra/database";
import { ForbiddenError, NotFoundError, ValidationError } from "infra/errors";
import { sendMail } from "infra/mailer";
import { getOrigin } from "infra/webserver";
import { PERMISSIONS, isAuthorized } from "models/authorization";
import {
  CreateUserInput,
  createUser,
  deleteUserById,
  getUserByEmail,
  getUserById,
  type User,
} from "models/user";

export type ActivationToken = {
  id: string;
  token: string;
  user_id: string;
  used_at: Date | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

const ACTIVATION_TOKEN_LIFETIME_MS = 1000 * 60 * 15; // 15 minutes
const FROM_DEFAULT = "Sacola <no-reply@sacola.dev>";

// `registerUser` is what the POST /api/v1/users route calls. It owns the
// "create user + send activation email" pair and rolls back the user row if
// the mailer throws — otherwise a failed send would leave an account stuck
// with no way to activate (the same email is taken, and they never got the
// link). Tokens written before the mail failure are cleaned up by the user
// delete, which cascades on `user_id` via the application code (no FK yet).
export async function registerUser(input: CreateUserInput): Promise<User> {
  const user = await createUser(input);
  try {
    await sendActivationEmail(user);
  } catch (error) {
    await deleteActivationTokensByUserId(user.id);
    await deleteUserById(user.id);
    throw error;
  }
  return user;
}

// Re-issue an activation link for a user who missed the original 15-minute
// window. Anti-enumeration: the caller never learns whether the email is on
// file or already activated — only the activatedUser-with-this-email path
// silently succeeds; everything else also returns void without an error.
//
// Existing pending tokens for the user are deleted before a new one is issued
// so a forwarded old email can't be used after the user requested a fresh one.
export async function resendActivationEmail(email: unknown): Promise<void> {
  if (typeof email !== "string" || !email.includes("@")) return;

  let user: User;
  try {
    user = await getUserByEmail(email.trim());
  } catch (error) {
    if (error instanceof NotFoundError) return; // anti-enum: silent
    throw error;
  }

  // Already activated → noop. If we sent a token here a logged-out attacker
  // who knows the email could trigger phishing fodder; the user has nothing
  // to gain either.
  const isUnactivated = user.features.length === 1 && user.features[0] === "read:activation_token";
  if (!isUnactivated) return;

  await deleteActivationTokensByUserId(user.id);
  await sendActivationEmail(user);
}

export async function sendActivationEmail(user: User): Promise<ActivationToken> {
  const tokenValue = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_LIFETIME_MS);
  const created = await createActivationTokenQuery(user.id, expiresAt, tokenValue);

  await sendMail({
    from: process.env.EMAIL_FROM ?? FROM_DEFAULT,
    to: user.email,
    subject: "Ative a sua conta no Sacola!",
    text: buildActivationEmailText(user, created),
  });

  return created;
}

export async function activateUserByToken(token: string): Promise<ActivationToken> {
  const activationToken = await getValidActivationTokenByToken(token);
  const targetUser = await getUserById(activationToken.user_id);

  if (!(await isAuthorized(targetUser, "read:activation_token"))) {
    throw new ForbiddenError({
      cause: new Error(`User ${targetUser.id} cannot use activation tokens`),
      message: "Você não possui permissão para usar este token de ativação.",
      action: "Entre em contato com o suporte.",
    });
  }

  const used = await markActivationTokenAsUsedQuery(activationToken.id);
  await updateUserFeaturesByIdQuery(activationToken.user_id, [
    ...PERMISSIONS.default.activatedUser,
  ]);

  return used;
}

export async function getActivationTokensByUserId(userId: string): Promise<ActivationToken[]> {
  const result = await query<ActivationToken>({
    text: `
      SELECT *
      FROM user_activation_tokens
      WHERE user_id = $1
      ORDER BY created_at DESC
    ;`,
    values: [userId],
  });
  return result.rows;
}

export async function deleteActivationTokensByUserId(userId: string): Promise<void> {
  await query({
    text: `DELETE FROM user_activation_tokens WHERE user_id = $1;`,
    values: [userId],
  });
}

async function getValidActivationTokenByToken(token: string): Promise<ActivationToken> {
  const result = await query<ActivationToken>({
    text: `
      SELECT *
      FROM user_activation_tokens
      WHERE token = $1
        AND used_at IS NULL
        AND expires_at > timezone('utc', now())
      LIMIT 1
    ;`,
    values: [token],
  });
  const found = result.rows[0];
  if (!found) {
    throw invalidActivationTokenError(token);
  }
  return found;
}

function invalidActivationTokenError(token: string): ValidationError {
  return new ValidationError({
    cause: new Error(`Activation token ${token} not found or invalid`),
    message: "Token de ativação inválido ou expirado.",
    action: "Solicite um novo email de ativação.",
  });
}

function buildActivationEmailText(user: User, token: ActivationToken): string {
  const link = `${getOrigin()}/cadastro/ativar/${token.token}`;
  return [
    `Olá, ${user.username}! 👋`,
    "",
    "Para ativar sua conta no Sacola, clique no link abaixo:",
    link,
    "",
    "Este link expira em 15 minutos.",
    "",
    "Atenciosamente,",
    "Equipe Sacola",
  ].join("\n");
}

async function createActivationTokenQuery(
  userId: string,
  expiresAt: Date,
  token: string,
): Promise<ActivationToken> {
  const result = await query<ActivationToken>({
    text: `
      INSERT INTO user_activation_tokens (user_id, expires_at, token)
      VALUES ($1, $2, $3)
      RETURNING *
    ;`,
    values: [userId, expiresAt, token],
  });
  return result.rows[0];
}

async function markActivationTokenAsUsedQuery(id: string): Promise<ActivationToken> {
  const result = await query<ActivationToken>({
    text: `
      UPDATE user_activation_tokens
      SET used_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
      WHERE id = $1
      RETURNING *
    ;`,
    values: [id],
  });
  return result.rows[0];
}

async function updateUserFeaturesByIdQuery(userId: string, features: string[]): Promise<User> {
  const result = await query<User>({
    text: `
      UPDATE users
      SET features = $2,
          updated_at = timezone('utc', now())
      WHERE id = $1
      RETURNING *
    ;`,
    values: [userId, features],
  });
  return result.rows[0];
}
