// CRUD + validation for the `users` table.
// All inserts go through `createUser`, which validates uniqueness and the
// username/email/password policy before hashing the password.

import { query } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";
import { PERMISSIONS } from "models/authorization";
import { hashObjectPassword } from "models/password";

export type User = {
  id: string;
  username: string;
  email: string;
  password: string;
  features: string[];
  created_at: Date;
  updated_at: Date;
};

export type PublicUser = Omit<User, "password">;

export type CreateUserInput = {
  username: string;
  email: string;
  password: string;
};

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_SPECIAL_PATTERN = /[^A-Za-z0-9]/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_EMAIL_LENGTH = 254;

export async function createUser(input: CreateUserInput): Promise<User> {
  validateInput(input);

  await assertUsernameAvailable(input.username);
  await assertEmailAvailable(input.email);

  const withFeatures = {
    ...input,
    features: [...PERMISSIONS.default.user],
  };
  const secured = await hashObjectPassword(withFeatures);

  return await insertUserQuery(secured);
}

export async function getUserById(id: string): Promise<User> {
  const user = await findUserByIdQuery(id);
  if (!user) {
    throw new NotFoundError({
      cause: new Error(`User ${id} not found`),
      message: `Usuário não encontrado.`,
      action: `Verifique se o id "${id}" está correto.`,
    });
  }
  return user;
}

export async function getUserByEmail(email: string): Promise<User> {
  const user = await findUserByEmailQuery(email);
  if (!user) {
    throw new NotFoundError({
      cause: new Error(`User with email "${email}" not found`),
      message: `Usuário não encontrado.`,
      action: `Verifique se o email "${email}" está correto.`,
    });
  }
  return user;
}

export async function getUserByUsername(username: string): Promise<User> {
  const user = await findUserByUsernameQuery(username);
  if (!user) {
    throw new NotFoundError({
      cause: new Error(`User "${username}" not found`),
      message: `Usuário "${username}" não encontrado.`,
      action: `Verifique se o usuário "${username}" existe.`,
    });
  }
  return user;
}

export function serializePublicUser(user: User): PublicUser {
  const { password: _password, ...publicFields } = user;
  return publicFields;
}

function validateInput(input: CreateUserInput): void {
  if (typeof input.username !== "string" || !USERNAME_PATTERN.test(input.username)) {
    throw new ValidationError({
      message: "Username inválido.",
      action: "Forneça um username com 3 a 32 caracteres (letras, números ou _).",
    });
  }

  if (
    typeof input.email !== "string" ||
    input.email.length > MAX_EMAIL_LENGTH ||
    !EMAIL_PATTERN.test(input.email)
  ) {
    throw new ValidationError({
      message: "Email inválido.",
      action: `Forneça um email válido com no máximo ${MAX_EMAIL_LENGTH} caracteres.`,
    });
  }

  if (
    typeof input.password !== "string" ||
    input.password.length < MIN_PASSWORD_LENGTH ||
    !PASSWORD_SPECIAL_PATTERN.test(input.password)
  ) {
    throw new ValidationError({
      message: "Senha inválida.",
      action: `Forneça uma senha com no mínimo ${MIN_PASSWORD_LENGTH} caracteres e pelo menos um caractere especial.`,
    });
  }
}

async function assertUsernameAvailable(username: string): Promise<void> {
  const existing = await findUserByUsernameQuery(username);
  if (existing) {
    throw new ValidationError({
      message: `O username "${username}" já está em uso.`,
      action: "Escolha outro username.",
    });
  }
}

async function assertEmailAvailable(email: string): Promise<void> {
  const existing = await findUserByEmailQuery(email);
  if (existing) {
    throw new ValidationError({
      message: `O email "${email}" já está em uso.`,
      action: "Faça login ou recupere a senha do email já cadastrado.",
    });
  }
}

async function findUserByIdQuery(id: string): Promise<User | null> {
  const result = await query<User>({
    text: `SELECT * FROM users WHERE id = $1 LIMIT 1;`,
    values: [id],
  });
  return result.rows[0] ?? null;
}

async function findUserByEmailQuery(email: string): Promise<User | null> {
  const result = await query<User>({
    text: `SELECT * FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1;`,
    values: [email],
  });
  return result.rows[0] ?? null;
}

async function findUserByUsernameQuery(username: string): Promise<User | null> {
  const result = await query<User>({
    text: `SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1;`,
    values: [username],
  });
  return result.rows[0] ?? null;
}

async function insertUserQuery(input: {
  username: string;
  email: string;
  password: string;
  features: string[];
}): Promise<User> {
  const result = await query<User>({
    text: `
      INSERT INTO
        users (username, email, password, features)
      VALUES
        ($1, $2, $3, $4)
      RETURNING
        *
    ;`,
    values: [input.username, input.email, input.password, input.features],
  });
  return result.rows[0];
}
