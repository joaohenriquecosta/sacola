// Pure role catalog. Lives in `lib/` (not `models/`) so client components can
// import role IDs / labels / dropdown choices without dragging the DB layer
// into their bundle.
//
// Runtime checks (`isAuthorized` / `requireAuthorization`) need a membership
// lookup; they stay in `models/authorization.ts` and import from here.

// Lists shared between roles. Adding a permission "to everything that
// manages a company" or "to everything that just reads" is one edit.
const COMPANY_MANAGEMENT_PERMISSIONS = [
  "read:company",
  "update:company",
  "read:member",
  "update:member",
  "delete:member",
  "read:invitation",
  "create:invitation",
  "delete:invitation",
  "read:audit_log",
] as const;

const READ_ONLY_PERMISSIONS = ["read:company", "read:member"] as const;

// Two tiers in the same catalog:
//
//   GENERIC roles — owner / admin / member — model org control. Any POP
//   (procedimento operacional padrão) on top of sacola uses these for
//   permission-management within a company.
//
//   SACOLA roles — gerente / vendedor / separador / entregador — model job
//   functions in a hortifruti operation. They alias the closest generic
//   role today; they will gain product/order/stock permissions when those
//   resources land (Semana 2-3 do roadmap), at which point inviting someone
//   as "vendedor" diverges from "member".
//
// Keep this explicit (no derive-from-base abstraction): any role change is
// one diff in this file.
export const ROLE_PERMISSIONS = {
  owner: [...COMPANY_MANAGEMENT_PERMISSIONS, "delete:company"],
  admin: [...COMPANY_MANAGEMENT_PERMISSIONS],
  member: [...READ_ONLY_PERMISSIONS],
  gerente: [...COMPANY_MANAGEMENT_PERMISSIONS],
  vendedor: [...READ_ONLY_PERMISSIONS],
  separador: [...READ_ONLY_PERMISSIONS],
  entregador: [...READ_ONLY_PERMISSIONS],
} as const satisfies Record<string, readonly string[]>;

export type Role = keyof typeof ROLE_PERMISSIONS;

export const ROLES: readonly Role[] = [
  "owner",
  "admin",
  "member",
  "gerente",
  "vendedor",
  "separador",
  "entregador",
];

// Roles an admin/owner can assign via invite or role-change. Excludes owner
// (assigned implicitly on company creation, transferred via a dedicated flow).
export const ASSIGNABLE_ROLES: readonly Role[] = [
  "admin",
  "member",
  "gerente",
  "vendedor",
  "separador",
  "entregador",
];

export function isValidRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const SCOPED_FEATURES: ReadonlySet<string> = new Set(Object.values(ROLE_PERMISSIONS).flat());
