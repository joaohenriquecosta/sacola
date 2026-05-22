import {
  comparePassword,
  getAuthDummyPasswordHash,
  hashObjectPassword,
  hashPassword,
} from "models/password";

describe("hashPassword", () => {
  test("returns a bcrypt hash distinct from the input", async () => {
    const hashed = await hashPassword("plain-text-secret");
    expect(typeof hashed).toBe("string");
    expect(hashed).not.toBe("plain-text-secret");
    expect(hashed.startsWith("$2")).toBe(true);
  });

  test("produces different hashes for the same input across calls (salted)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
  });
});

describe("comparePassword", () => {
  test("returns true for the matching password", async () => {
    const hashed = await hashPassword("correct-horse");
    expect(await comparePassword("correct-horse", hashed)).toBe(true);
  });

  test("returns false for a wrong password", async () => {
    const hashed = await hashPassword("correct-horse");
    expect(await comparePassword("battery-staple", hashed)).toBe(false);
  });
});

describe("hashObjectPassword", () => {
  test("returns a new object with the password hashed and other fields intact", async () => {
    const input = { username: "alice", email: "a@x.com", password: "p" };
    const result = await hashObjectPassword(input);
    expect(result.username).toBe("alice");
    expect(result.email).toBe("a@x.com");
    expect(result.password).not.toBe("p");
    expect(result.password.startsWith("$2")).toBe(true);
  });

  test("does not mutate the input object", async () => {
    const input = { password: "original" };
    await hashObjectPassword(input);
    expect(input.password).toBe("original");
  });
});

describe("getAuthDummyPasswordHash", () => {
  test("returns a bcrypt hash and is memoized across calls", async () => {
    const a = await getAuthDummyPasswordHash();
    const b = await getAuthDummyPasswordHash();
    expect(a.startsWith("$2")).toBe(true);
    expect(a).toBe(b);
  });
});
