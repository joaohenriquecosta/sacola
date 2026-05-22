// Password hashing helpers (bcrypt). `getAuthDummyPasswordHash` returns a
// memoized hash used during login when the email doesn't exist, so we still
// pay the cost of one `compare()` — prevents email enumeration via timing.

import { compare, hash } from "bcryptjs";

let authDummyHashPromise: Promise<string> | null = null;

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = process.env.NODE_ENV === "production" ? 14 : 1;
  return await hash(password, saltRounds);
}

export async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  return await compare(password, hashedPassword);
}

export async function hashObjectPassword<T extends { password: string }>(object: T): Promise<T> {
  return { ...object, password: await hashPassword(object.password) };
}

export async function getAuthDummyPasswordHash(): Promise<string> {
  authDummyHashPromise ??= hashPassword("__auth_timing_dummy_v1__");
  return await authDummyHashPromise;
}
