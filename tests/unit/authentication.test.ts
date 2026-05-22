// Unit tests for models/authentication.ts. user + password models are mocked
// so we exercise the timing-equalization logic without touching Postgres or
// running real bcrypt rounds. Real coverage of the login path lands in the
// integration tests for POST /api/v1/sessions.

jest.mock("models/user", () => ({
  getUserByEmail: jest.fn(),
}));

jest.mock("models/password", () => ({
  comparePassword: jest.fn(),
  getAuthDummyPasswordHash: jest.fn(),
}));

import { AuthenticationError, NotFoundError, ValidationError } from "infra/errors";
import { getUser } from "models/authentication";
import { comparePassword, getAuthDummyPasswordHash } from "models/password";
import { getUserByEmail } from "models/user";

const mockedGetUserByEmail = getUserByEmail as jest.MockedFunction<typeof getUserByEmail>;
const mockedCompare = comparePassword as jest.MockedFunction<typeof comparePassword>;
const mockedDummy = getAuthDummyPasswordHash as jest.MockedFunction<
  typeof getAuthDummyPasswordHash
>;

const storedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  email: "alice@example.com",
  password: "$2a$01$realhash",
  features: ["create:session"],
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedDummy.mockResolvedValue("$2a$01$dummyhash");
});

describe("getUser validation", () => {
  test("rejects missing email", async () => {
    await expect(getUser("", "pw")).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects missing password", async () => {
    await expect(getUser("a@x.com", "")).rejects.toBeInstanceOf(ValidationError);
  });

  test("rejects non-string inputs", async () => {
    await expect(getUser(123 as unknown as string, "pw")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("getUser happy path", () => {
  test("returns the user when the password matches", async () => {
    mockedGetUserByEmail.mockResolvedValueOnce(storedUser);
    mockedCompare.mockResolvedValueOnce(true);
    const result = await getUser("alice@example.com", "correct-pw");
    expect(result).toEqual(storedUser);
    expect(mockedCompare).toHaveBeenCalledWith("correct-pw", storedUser.password);
  });

  test("trims whitespace from the provided email before lookup", async () => {
    mockedGetUserByEmail.mockResolvedValueOnce(storedUser);
    mockedCompare.mockResolvedValueOnce(true);
    await getUser("   alice@example.com   ", "correct-pw");
    expect(mockedGetUserByEmail).toHaveBeenCalledWith("alice@example.com");
  });
});

describe("getUser failure paths (anti-enumeration)", () => {
  test("throws AuthenticationError on wrong password — no dummy compare needed", async () => {
    mockedGetUserByEmail.mockResolvedValueOnce(storedUser);
    mockedCompare.mockResolvedValueOnce(false);
    await expect(getUser("alice@example.com", "wrong")).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(mockedDummy).not.toHaveBeenCalled();
  });

  test("throws AuthenticationError when email is missing, AND runs a dummy compare", async () => {
    mockedGetUserByEmail.mockRejectedValueOnce(
      new NotFoundError({ message: "Usuário não encontrado." }),
    );
    mockedCompare.mockResolvedValueOnce(false);

    await expect(getUser("ghost@example.com", "any-pw")).rejects.toBeInstanceOf(
      AuthenticationError,
    );

    expect(mockedDummy).toHaveBeenCalledTimes(1);
    expect(mockedCompare).toHaveBeenCalledWith("any-pw", "$2a$01$dummyhash");
  });

  test("uses identical AuthenticationError shape for wrong password and missing email", async () => {
    mockedGetUserByEmail.mockResolvedValueOnce(storedUser);
    mockedCompare.mockResolvedValueOnce(false);
    let wrongPwError!: AuthenticationError;
    try {
      await getUser("alice@example.com", "bad");
    } catch (error) {
      wrongPwError = error as AuthenticationError;
    }

    mockedGetUserByEmail.mockRejectedValueOnce(new NotFoundError({}));
    mockedCompare.mockResolvedValueOnce(false);
    let missingEmailError!: AuthenticationError;
    try {
      await getUser("ghost@example.com", "bad");
    } catch (error) {
      missingEmailError = error as AuthenticationError;
    }

    expect(wrongPwError.message).toBe(missingEmailError.message);
    expect(wrongPwError.action).toBe(missingEmailError.action);
    expect(wrongPwError.statusCode).toBe(missingEmailError.statusCode);
  });

  test("re-throws non-NotFound errors without swallowing them", async () => {
    const fatal = new Error("db down");
    mockedGetUserByEmail.mockRejectedValueOnce(fatal);
    await expect(getUser("a@x.com", "pw")).rejects.toBe(fatal);
  });
});
