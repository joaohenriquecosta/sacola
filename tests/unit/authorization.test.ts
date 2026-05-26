import { InternalServerError } from "infra/errors";
import { PERMISSIONS, filterOutput, isAuthorized } from "models/authorization";

const anonymous = { id: null, features: PERMISSIONS.default.anonymousUser };
const alice = {
  id: "00000000-0000-0000-0000-000000000001",
  features: PERMISSIONS.default.activatedUser,
};
const bob = {
  id: "00000000-0000-0000-0000-000000000002",
  features: PERMISSIONS.default.activatedUser,
};

describe("isAuthorized", () => {
  test("grants features the user has", () => {
    expect(isAuthorized(alice, "create:session")).toBe(true);
    expect(isAuthorized(alice, "read:session")).toBe(true);
  });

  test("denies features the user does not have", () => {
    expect(isAuthorized(alice, "read:user")).toBe(false);
    expect(isAuthorized(anonymous, "read:user:self")).toBe(false);
  });

  test("anonymous user can create:user and create:session", () => {
    expect(isAuthorized(anonymous, "create:user")).toBe(true);
    expect(isAuthorized(anonymous, "create:session")).toBe(true);
  });

  test("update:user allows the user to update themselves", () => {
    expect(isAuthorized(alice, "update:user", { id: alice.id })).toBe(true);
  });

  test("update:user denies updating another user", () => {
    expect(isAuthorized(alice, "update:user", { id: bob.id })).toBe(false);
  });

  test("update:user without a resource is denied", () => {
    expect(isAuthorized(alice, "update:user")).toBe(false);
  });

  test("throws InternalServerError for unknown features", () => {
    expect(() => isAuthorized(alice, "delete:universe")).toThrow(InternalServerError);
  });

  test("throws InternalServerError when user has no features", () => {
    expect(() =>
      isAuthorized({ id: alice.id, features: undefined as unknown as string[] }, "read:status"),
    ).toThrow(InternalServerError);
  });
});

describe("filterOutput", () => {
  const dbUser = {
    id: alice.id,
    username: "alice",
    email: "alice@example.com",
    password: "$2a$01$secret-do-not-leak",
    features: ["create:session"],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  };

  test("read:user strips email and password (public view)", () => {
    const output = filterOutput(alice, "read:user", dbUser);
    expect(output).toEqual({
      id: dbUser.id,
      username: dbUser.username,
      features: dbUser.features,
      created_at: dbUser.created_at,
      updated_at: dbUser.updated_at,
    });
    expect(output).not.toHaveProperty("email");
    expect(output).not.toHaveProperty("password");
  });

  test("read:user:self includes email when requester matches the resource", () => {
    const output = filterOutput(alice, "read:user:self", dbUser);
    expect(output).toEqual({
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      features: dbUser.features,
      created_at: dbUser.created_at,
      updated_at: dbUser.updated_at,
    });
    expect(output).not.toHaveProperty("password");
  });

  test("read:user:self returns nothing when requester is not the resource", () => {
    const output = filterOutput(bob, "read:user:self", dbUser);
    expect(output).toEqual({});
  });

  test("read:session returns full session fields when requester owns it", () => {
    const session = {
      id: "session-1",
      user_id: alice.id,
      token: "hexhexhex",
      expires_at: "2026-01-03T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    };
    expect(filterOutput(alice, "read:session", session)).toEqual(session);
  });

  test("read:session returns nothing when requester does not own the session", () => {
    const session = {
      id: "session-1",
      user_id: bob.id,
      token: "hexhexhex",
      expires_at: "2026-01-03T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    };
    expect(filterOutput(alice, "read:session", session)).toEqual({});
  });
});
