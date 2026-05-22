// Unit tests for models/session.ts. infra/database and models/user are
// mocked so the orchestration around createSession can be exercised without
// touching Postgres. Real INSERT/SELECT coverage lives in the integration
// tests for the /api/v1/sessions endpoints.

jest.mock("infra/database", () => ({
  query: jest.fn(),
}));

jest.mock("models/user", () => ({
  getUserById: jest.fn(),
}));

import { query } from "infra/database";
import { AuthenticationError, ForbiddenError } from "infra/errors";
import { PERMISSIONS } from "models/authorization";
import {
  SESSION_LIFETIME_MS,
  createSession,
  expireSessionById,
  getValidSessionByToken,
  refreshSession,
} from "models/session";
import { getUserById } from "models/user";

const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedGetUserById = getUserById as jest.MockedFunction<typeof getUserById>;

const userWithSessionFeature = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  email: "alice@example.com",
  password: "$2a$01$hash",
  features: [...PERMISSIONS.default.user],
  created_at: new Date(),
  updated_at: new Date(),
};

const userWithoutSessionFeature = {
  ...userWithSessionFeature,
  features: ["read:status"],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createSession", () => {
  test("inserts a session with a 96-hex token and an expiry 6h ahead", async () => {
    mockedGetUserById.mockResolvedValueOnce(userWithSessionFeature);
    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "s-1",
          token: "x".repeat(96),
          user_id: userWithSessionFeature.id,
          expires_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    } as never);

    const before = Date.now();
    const session = await createSession(userWithSessionFeature.id);
    const after = Date.now();

    expect(session.user_id).toBe(userWithSessionFeature.id);

    const insertCall = mockedQuery.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(insertCall.text).toContain("INSERT INTO");
    const [token, userId, expiresAt] = insertCall.values as [string, string, Date];
    expect(/^[0-9a-f]{96}$/.test(token)).toBe(true);
    expect(userId).toBe(userWithSessionFeature.id);
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + SESSION_LIFETIME_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after + SESSION_LIFETIME_MS);
  });

  test("throws ForbiddenError when the user lacks create:session", async () => {
    mockedGetUserById.mockResolvedValueOnce(userWithoutSessionFeature);
    await expect(createSession(userWithoutSessionFeature.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});

describe("getValidSessionByToken", () => {
  test("returns the row when a non-expired token matches", async () => {
    const session = {
      id: "s-1",
      token: "abc",
      user_id: userWithSessionFeature.id,
      expires_at: new Date(Date.now() + 1000),
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockedQuery.mockResolvedValueOnce({ rows: [session] } as never);
    expect(await getValidSessionByToken("abc")).toEqual(session);
  });

  test("throws AuthenticationError when no row matches", async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] } as never);
    await expect(getValidSessionByToken("missing")).rejects.toBeInstanceOf(AuthenticationError);
  });
});

describe("refreshSession", () => {
  test("updates expires_at to ~now + lifetime and returns the row", async () => {
    const refreshed = {
      id: "s-1",
      token: "abc",
      user_id: userWithSessionFeature.id,
      expires_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockedQuery.mockResolvedValueOnce({ rows: [refreshed] } as never);
    const result = await refreshSession("s-1");
    expect(result).toEqual(refreshed);
    const call = mockedQuery.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(call.text).toContain("UPDATE");
    expect(call.text).toContain("expires_at = $2");
    expect(call.values[0]).toBe("s-1");
  });
});

describe("expireSessionById", () => {
  test("backdates expires_at by one year so the session is immediately invalid", async () => {
    const expired = {
      id: "s-1",
      token: "abc",
      user_id: userWithSessionFeature.id,
      expires_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockedQuery.mockResolvedValueOnce({ rows: [expired] } as never);
    await expireSessionById("s-1");
    const call = mockedQuery.mock.calls[0][0] as { text: string };
    expect(call.text).toContain("UPDATE");
    expect(call.text).toContain("INTERVAL '1 year'");
  });
});
