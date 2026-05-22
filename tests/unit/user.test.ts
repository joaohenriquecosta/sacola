// Unit tests for models/user.ts. The DB layer is mocked so validation logic
// and the orchestration around `createUser` can be exercised without Postgres.
// Real INSERT + SELECT coverage lives in the integration tests for
// POST /api/v1/users.

jest.mock("infra/database", () => ({
  query: jest.fn(),
}));

import { query } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";
import { PERMISSIONS } from "models/authorization";
import {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  serializePublicUser,
} from "models/user";

const mockedQuery = query as jest.MockedFunction<typeof query>;

const existingUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  email: "alice@example.com",
  password: "$2a$01$hash",
  features: [...PERMISSIONS.default.user],
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-01-02"),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createUser validation", () => {
  test("rejects usernames shorter than 3 chars", async () => {
    await expect(
      createUser({ username: "ab", email: "ab@example.com", password: "longenough!123" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects usernames with disallowed characters", async () => {
    await expect(
      createUser({ username: "ali ce", email: "a@example.com", password: "longenough!123" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects malformed emails", async () => {
    await expect(
      createUser({ username: "alice", email: "not-an-email", password: "longenough!123" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects passwords shorter than 12 chars", async () => {
    await expect(
      createUser({ username: "alice", email: "a@example.com", password: "Short1!" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects passwords without a special character", async () => {
    await expect(
      createUser({ username: "alice", email: "a@example.com", password: "abcdef123456" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("createUser uniqueness", () => {
  test("rejects duplicate username (case-insensitive)", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [existingUser] } as never);
    await expect(
      createUser({ username: "ALICE", email: "new@example.com", password: "longenough!123" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects duplicate email when username is free", async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [existingUser] } as never);
    await expect(
      createUser({ username: "bob", email: "ALICE@example.com", password: "longenough!123" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("createUser happy path", () => {
  test("hashes the password and assigns default features before insert", async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({
        rows: [{ ...existingUser, username: "bob", email: "bob@example.com" }],
      } as never);

    const result = await createUser({
      username: "bob",
      email: "bob@example.com",
      password: "longenough!123",
    });

    expect(result.username).toBe("bob");

    const insertCall = mockedQuery.mock.calls[2][0] as { text: string; values: unknown[] };
    expect(insertCall.text).toContain("INSERT INTO");
    const [username, email, password, features] = insertCall.values;
    expect(username).toBe("bob");
    expect(email).toBe("bob@example.com");
    expect(String(password).startsWith("$2")).toBe(true);
    expect(password).not.toBe("longenough!123");
    expect(features).toEqual([...PERMISSIONS.default.user]);
  });
});

describe("getUserById / getUserByEmail / getUserByUsername", () => {
  test("returns the row when found", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [existingUser] } as never);
    expect(await getUserById(existingUser.id)).toEqual(existingUser);
  });

  test("throws NotFoundError when no row is found", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(getUserByEmail("missing@example.com")).rejects.toBeInstanceOf(NotFoundError);
  });

  test("getUserByUsername throws NotFoundError on miss", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(getUserByUsername("ghost")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("serializePublicUser", () => {
  test("strips the password field", () => {
    const publicUser = serializePublicUser(existingUser);
    expect(publicUser).not.toHaveProperty("password");
    expect(publicUser.id).toBe(existingUser.id);
    expect(publicUser.email).toBe(existingUser.email);
  });
});
