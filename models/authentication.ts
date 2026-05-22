// Authenticates a (email, password) pair against the users table.
// When the email is not found we still run one bcrypt compare against a
// dummy hash so the response timing matches the wrong-password branch —
// prevents email enumeration via timing or response shape.

import { AuthenticationError, NotFoundError, ValidationError } from "infra/errors";
import { comparePassword, getAuthDummyPasswordHash } from "models/password";
import { User, getUserByEmail } from "models/user";

export async function getUser(providedEmail: unknown, providedPassword: unknown): Promise<User> {
  if (
    typeof providedEmail !== "string" ||
    typeof providedPassword !== "string" ||
    !providedEmail.trim() ||
    !providedPassword
  ) {
    throw new ValidationError({
      message: "Email e senha são obrigatórios.",
      action: "Forneça um email e uma senha válidos.",
    });
  }

  const email = providedEmail.trim();

  try {
    const storedUser = await getUserByEmail(email);
    const isPasswordValid = await comparePassword(providedPassword, storedUser.password);
    if (!isPasswordValid) {
      throw authenticationFailure("auth_invalid_password");
    }
    return storedUser;
  } catch (error) {
    if (error instanceof NotFoundError) {
      await comparePassword(providedPassword, await getAuthDummyPasswordHash());
      throw authenticationFailure("auth_email_not_found");
    }
    throw error;
  }
}

function authenticationFailure(causeMessage: string): AuthenticationError {
  return new AuthenticationError({
    cause: new Error(causeMessage),
    message: "Email ou senha inválidos.",
    action: "Verifique se o email e a senha fornecidos são válidos.",
  });
}
