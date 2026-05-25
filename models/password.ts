// Password hashing helpers (bcrypt). `getAuthDummyPasswordHash` returns a
// memoized hash used during login when the email doesn't exist, so we still
// pay the cost of one `compare()` — prevents email enumeration via timing.

import { compare, hash } from "bcryptjs";

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

// Eagerly kick off the hash at module load so the first ghost-email login
// doesn't pay ~1.5s for bcrypt.hash on a cold Lambda. The promise is awaited
// later; here we just start it. A real login on the same cold instance also
// runs bcrypt.compare, so the cold-start cost is incurred anyway.
const authDummyHashPromise: Promise<string> = hashPassword("__auth_timing_dummy_v1__");

export async function getAuthDummyPasswordHash(): Promise<string> {
  return await authDummyHashPromise;
}
