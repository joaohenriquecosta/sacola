import { InternalServerError } from "infra/errors";
import {
  ASSIGNABLE_ROLES,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  filterOutput,
  isAuthorized,
  isValidRole,
} from "models/authorization";

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
  test("grants features the user has", async () => {
    expect(await isAuthorized(alice, "create:session")).toBe(true);
    expect(await isAuthorized(alice, "read:session")).toBe(true);
  });

  test("denies features the user does not have", async () => {
    expect(await isAuthorized(alice, "read:user")).toBe(false);
    expect(await isAuthorized(anonymous, "read:user:self")).toBe(false);
  });

  test("anonymous user can create:user and create:session", async () => {
    expect(await isAuthorized(anonymous, "create:user")).toBe(true);
    expect(await isAuthorized(anonymous, "create:session")).toBe(true);
  });

  test("activated user can create:company", async () => {
    expect(await isAuthorized(alice, "create:company")).toBe(true);
    expect(await isAuthorized(anonymous, "create:company")).toBe(false);
  });

  test("update:user allows the user to update themselves", async () => {
    expect(await isAuthorized(alice, "update:user", { resource: { id: alice.id } })).toBe(true);
  });

  test("update:user denies updating another user", async () => {
    expect(await isAuthorized(alice, "update:user", { resource: { id: bob.id } })).toBe(false);
  });

  test("update:user without a resource is denied", async () => {
    expect(await isAuthorized(alice, "update:user")).toBe(false);
  });

  test("throws InternalServerError for unknown features", async () => {
    await expect(isAuthorized(alice, "delete:universe")).rejects.toBeInstanceOf(
      InternalServerError,
    );
  });

  test("throws InternalServerError when user has no features", async () => {
    await expect(
      isAuthorized({ id: alice.id, features: undefined as unknown as string[] }, "read:status"),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  test("scoped feature requires companyId or resource.company_id", async () => {
    await expect(isAuthorized(alice, "read:company")).rejects.toBeInstanceOf(InternalServerError);
  });
});

describe("Role catalog", () => {
  test("ROLES is closed under ROLE_PERMISSIONS", () => {
    expect([...ROLES].sort()).toEqual(Object.keys(ROLE_PERMISSIONS).sort());
  });

  test("ASSIGNABLE_ROLES excludes owner (assigned implicitly / via transfer)", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("owner");
    expect(ASSIGNABLE_ROLES.length).toBe(ROLES.length - 1);
  });

  test("isValidRole accepts known roles and rejects strangers", () => {
    expect(isValidRole("gerente")).toBe(true);
    expect(isValidRole("entregador")).toBe(true);
    expect(isValidRole("anonymousUser")).toBe(false); // not a role
    expect(isValidRole(42)).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
  });

  test("owner is the only role that holds delete:company", () => {
    for (const role of ROLES) {
      const hasDelete = (ROLE_PERMISSIONS[role] as readonly string[]).includes("delete:company");
      expect(hasDelete).toBe(role === "owner");
    }
  });

  test("gerente has the same scoped permission set as admin (today)", () => {
    expect([...ROLE_PERMISSIONS.gerente].sort()).toEqual([...ROLE_PERMISSIONS.admin].sort());
  });

  test("separador extends baseline com transition:order:separar + create:stock_movement", () => {
    // Separador transita pedido para "separado" e lança movimento de
    // estoque (saída ao separar, recontagem manual).
    const member: readonly string[] = ROLE_PERMISSIONS.member;
    const features: readonly string[] = ROLE_PERMISSIONS.separador;
    const extra = features.filter((f) => !member.includes(f)).sort();
    expect(extra).toEqual(["create:stock_movement", "transition:order:separar"]);
  });

  test("entregador extends baseline com transition:order:entregar (operacional)", () => {
    const member: readonly string[] = ROLE_PERMISSIONS.member;
    const features: readonly string[] = ROLE_PERMISSIONS.entregador;
    const extra = features.filter((f) => !member.includes(f)).sort();
    expect(extra).toEqual(["transition:order:entregar"]);
  });

  test("vendedor extends baseline com cliente create/update, order create + cancelar", () => {
    // Vendedor é front-line: cadastra/atualiza cliente + abre pedido +
    // cancela próprio pedido. Não transita pra separado/entregue
    // (operação) nem apaga cadastro (gerente).
    const vendedor: readonly string[] = ROLE_PERMISSIONS.vendedor;
    const member: readonly string[] = ROLE_PERMISSIONS.member;
    const extra = vendedor.filter((f) => !member.includes(f)).sort();
    expect(extra).toEqual([
      "create:client",
      "create:order",
      "transition:order:cancelar",
      "update:client",
    ]);
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
